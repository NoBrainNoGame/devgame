import "@/lib/server-only";

import { CREW_BALANCE } from "@/game/core/balance";
import { getAvailableActions, isActionAvailable } from "@/game/core/rules/actions";
import {
  HEAD_OFFICE,
  leadSeat,
  occupiedSeats,
  siteHeadcount,
  siteSeats,
} from "@/game/core/rules/crew";
import { TURN_ACTIONS } from "@/game/core/rules/reducer";
import { defaultUnlockedSkills, hashState } from "@/game/core/run";
import { playerScore } from "@/game/core/score";
import type { GameEvent, PlayerAction, RunState, Seat } from "@/game/core/types";
import {
  cardOf,
  createWorld,
  stepWorld,
  type WorldState,
  withCard,
  withoutCompany,
  worldInputFor,
} from "@/game/core/world";
import { applyEntry, type CompanyEntry, startCompany } from "@/game/dto/company";
import type { MemberDto, SeatStatus, ServerMessage } from "@/game/dto/realtime";
import { CREW_EPOCH, RULES_EPOCH } from "@/game/dto/version";
import { driveSeat } from "@/realtime/autopilot";
import { REALTIME_LIMITS } from "@/realtime/limits";
import { type RankableCompany, type RankablePlayer, rankingFor } from "@/realtime/ranking";
import type {
  CompanyStart,
  CompanyWrite,
  StoredCompany,
  StoredEntry,
  StoredMember,
  StoredWorld,
} from "@/realtime/store";

/**
 * The persistent world: every company, every seated player and the lobby,
 * in memory, with no socket and no clock of its own. The server feeds it
 * what players send and the moment a round is due; it answers with the
 * messages to deliver (`Out`) and the writes to persist (`drainWrites`).
 * That separation is what lets the whole of it be tested without a network
 * and without waiting 30 seconds.
 */

export type Target = { profile: string } | { company: string; except?: string };

export interface Out {
  to: Target;
  message: ServerMessage;
}

export interface Profile {
  profileId: string;
  name: string;
}

export interface WorldOptions {
  now: () => number;
  /** Ids for companies. Injected so tests are deterministic. */
  newId: () => string;
  /** The world's seed: its events fall the same way after a restart. */
  seed: string;
  roundMs?: number;
}

interface LiveMember {
  profileId: string;
  seat: Seat;
  name: string;
  site: string;
  misses: number;
  autopilot: boolean;
  autopilotRounds: number;
  left: boolean;
  finalScore: number;
}

interface Question {
  kind: "relic" | "event";
  options: string[];
  deadline: number;
  votes: Map<Seat, string>;
}

interface LiveCompany {
  id: string;
  name: string;
  start: CompanyStart;
  rulesEpoch: number;
  crewEpoch: number;
  state: RunState;
  seq: number;
  hash: string;
  /** Rounds resolved so far; the one players are choosing for is this number. */
  round: number;
  members: LiveMember[];
  pending: Map<Seat, PlayerAction>;
  question: Question | null;
  snapshot: { seq: number; state: RunState } | null;
  /** Entries since the snapshot: what a joiner replays. */
  entries: StoredEntry[];
  roundsSinceSnapshot: number;
  dirty: { created: boolean; entries: StoredEntry[]; snapshot?: { seq: number; state: RunState } };
  closed: null | { reason: "dissolved" | "abandoned" | "shutdown" };
  /** Who was in the company when it closed: they still hear the closing. */
  farewell: string[];
}

export class WorldError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorldError";
  }
}

/** The state of the world, for the server to persist between ticks. */
export interface WorldCursor {
  round: number;
  rng: number;
  lastEventRound: number;
}

export class RealtimeWorld {
  private readonly now: () => number;
  private readonly newId: () => string;
  readonly roundMs: number;
  private world: WorldState;
  private readonly companies = new Map<string, LiveCompany>();
  /** Which company and seat each seated profile holds. */
  private readonly seated = new Map<string, { companyId: string; seat: Seat }>();
  private readonly online = new Map<string, Profile>();
  private readonly waiting = new Map<string, string>();
  private deadline = 0;
  private worldDirty = false;

  constructor(
    options: WorldOptions,
    recovered?: { world: StoredWorld; companies: StoredCompany[] },
  ) {
    this.now = options.now;
    this.newId = options.newId;
    this.roundMs = options.roundMs ?? CREW_BALANCE.crew.roundSeconds * 1000;
    this.world = createWorld(options.seed);
    if (recovered !== undefined) {
      this.world = {
        ...this.world,
        round: recovered.world.round,
        rng: { s: recovered.world.rng },
        lastEventRound: recovered.world.lastEventRound,
      };
      for (const stored of recovered.companies) this.recover(stored);
    }
  }

  // ---------------------------------------------------------------- recovery

  /**
   * Rebuilds a stored company by replaying it from its snapshot, and checks
   * the last hash. A company that does not land on the hash it stored is
   * abandoned rather than served: better a lost company than a diverged one.
   */
  private recover(stored: StoredCompany): void {
    const outdated = stored.rulesEpoch !== RULES_EPOCH || stored.crewEpoch !== CREW_EPOCH;
    let state: RunState | null = null;
    if (!outdated) {
      try {
        state = stored.snapshot?.state ?? startCompany(stored.start);
        for (const row of stored.entries) state = applyEntry(state, row.entry).state;
        const last = stored.entries[stored.entries.length - 1];
        if (last !== undefined && hashState(state) !== last.hash) state = null;
      } catch (error) {
        console.error(`realtime: company ${stored.id} cannot be replayed`, error);
        state = null;
      }
    }
    if (state === null) {
      console.error(`realtime: company ${stored.id} abandoned at boot (diverged or outdated)`);
      return;
    }

    const live: LiveCompany = {
      id: stored.id,
      name: stored.name,
      start: stored.start,
      rulesEpoch: stored.rulesEpoch,
      crewEpoch: stored.crewEpoch,
      state,
      seq: stored.seq,
      hash: hashState(state),
      round: stored.entries.filter((row) => row.entry.kind === "round").length,
      members: stored.members.map((member) => ({
        profileId: member.profileId,
        seat: member.seat,
        name: member.name,
        site: member.site,
        misses: member.missesInRow,
        autopilot: member.autopilot,
        autopilotRounds: 0,
        left: member.left,
        finalScore: member.finalScore,
      })),
      pending: new Map(),
      question: null,
      snapshot: stored.snapshot,
      entries: stored.entries,
      roundsSinceSnapshot: stored.entries.filter((row) => row.entry.kind === "round").length,
      dirty: { created: false, entries: [] },
      closed: null,
      farewell: [],
    };
    this.companies.set(live.id, live);
    for (const member of live.members) {
      if (!member.left)
        this.seated.set(member.profileId, { companyId: live.id, seat: member.seat });
    }
    this.world = withCard(this.world, cardOf(live.id, live.state));
    this.openQuestionIfNeeded(live, []);
  }

  // ----------------------------------------------------------------- queries

  /** The cursor the server persists with each tick. */
  cursor(): WorldCursor {
    return {
      round: this.world.round,
      rng: this.world.rng.s,
      lastEventRound: this.world.lastEventRound,
    };
  }

  seatOf(profileId: string): { companyId: string; seat: Seat } | undefined {
    return this.seated.get(profileId);
  }

  isOnline(profileId: string): boolean {
    return this.online.has(profileId);
  }

  /** Who a message addressed to a company reaches: its seated players, and those it just closed on. */
  audience(companyId: string, except?: string): string[] {
    const company = this.companies.get(companyId);
    if (company === undefined) return [];
    const seated = company.members.filter((m) => !m.left).map((m) => m.profileId);
    return [...new Set([...seated, ...company.farewell])].filter((id) => id !== except);
  }

  companyIds(): string[] {
    return [...this.companies.keys()].sort();
  }

  stateOf(companyId: string): RunState | undefined {
    return this.companies.get(companyId)?.state;
  }

  hashOf(companyId: string): string | undefined {
    return this.companies.get(companyId)?.hash;
  }

  seqOf(companyId: string): number {
    return this.companies.get(companyId)?.seq ?? 0;
  }

  roundOf(companyId: string): number {
    return this.companies.get(companyId)?.round ?? 0;
  }

  questionOf(companyId: string): Question | null {
    return this.companies.get(companyId)?.question ?? null;
  }

  currentDeadline(): number {
    return this.deadline;
  }

  // -------------------------------------------------------------- connection

  /** A socket opened for a profile. Returns what it should be sent first. */
  connect(profile: Profile): Out[] {
    const out: Out[] = [];
    this.online.set(profile.profileId, profile);
    const held = this.seated.get(profile.profileId);
    if (held === undefined) {
      out.push({ to: { profile: profile.profileId }, message: this.lobbyState(profile.profileId) });
      return out;
    }
    const company = this.requireCompany(held.companyId);
    const member = this.memberAt(company, held.seat);
    if (member !== undefined) {
      out.push(...this.joinedMessages(company, member));
      out.push(this.statusChange(company, member));
    }
    return out;
  }

  /** The last socket of a profile closed. A seated player's seat stays, offline. */
  disconnect(profileId: string): Out[] {
    this.online.delete(profileId);
    this.waiting.delete(profileId);
    const held = this.seated.get(profileId);
    if (held === undefined) return this.lobbyBroadcast();
    const company = this.companies.get(held.companyId);
    const member = company === undefined ? undefined : this.memberAt(company, held.seat);
    if (company === undefined || member === undefined) return [];
    return [this.statusChange(company, member)];
  }

  // ------------------------------------------------------------------- lobby

  lobbyState(profileId: string): ServerMessage {
    const open = this.openCompanies();
    const ranked = [...open].sort(
      (a, b) => this.scoreOf(b) - this.scoreOf(a) || (a.id < b.id ? -1 : 1),
    );
    return {
      type: "lobby.state",
      companies: open.map((company) => ({
        id: company.id,
        name: company.name,
        members: occupiedSeats(company.state).length,
        freeSeats: this.freeSeats(company),
        score: this.scoreOf(company),
        rank: ranked.indexOf(company) + 1,
      })),
      waiting: [...this.waiting].map(([id, name]) => ({ profileId: id, name })),
      waitingYou: this.waiting.has(profileId),
    };
  }

  private lobbyBroadcast(): Out[] {
    const out: Out[] = [];
    for (const profile of this.online.values()) {
      if (this.seated.has(profile.profileId)) continue;
      out.push({ to: { profile: profile.profileId }, message: this.lobbyState(profile.profileId) });
    }
    return out;
  }

  wait(profile: Profile): Out[] {
    if (this.seated.has(profile.profileId)) {
      throw new WorldError("seated", "You already have a seat: leave it first");
    }
    this.waiting.set(profile.profileId, profile.name);
    return this.lobbyBroadcast();
  }

  unwait(profileId: string): Out[] {
    this.waiting.delete(profileId);
    return this.lobbyBroadcast();
  }

  // ---------------------------------------------------------------- companies

  createCompany(profile: Profile, name: string): Out[] {
    this.requireFree(profile.profileId);
    const trimmed = name.trim();
    const { min, max } = REALTIME_LIMITS.companyName;
    if (trimmed.length < min || trimmed.length > max) {
      throw new WorldError("bad-name", `A company name has ${min} to ${max} characters`);
    }
    if (this.openCompanies().length >= REALTIME_LIMITS.companiesPerWorld) {
      throw new WorldError("world-full", "The world is full: join a company instead");
    }

    const id = this.newId();
    const start: CompanyStart = {
      seed: `co-${id}`,
      name: trimmed,
      founder: profile.name,
      profileId: "junior",
      unlockedSkills: [...defaultUnlockedSkills()],
      startingSkillPoints: 0,
    };
    const state = startCompany(start);
    const company: LiveCompany = {
      id,
      name: trimmed,
      start,
      rulesEpoch: RULES_EPOCH,
      crewEpoch: CREW_EPOCH,
      state,
      seq: 0,
      hash: hashState(state),
      round: 0,
      members: [
        {
          profileId: profile.profileId,
          seat: leadSeat(state),
          name: profile.name,
          site: HEAD_OFFICE,
          misses: 0,
          autopilot: false,
          autopilotRounds: 0,
          left: false,
          finalScore: 0,
        },
      ],
      pending: new Map(),
      question: null,
      snapshot: null,
      entries: [],
      roundsSinceSnapshot: 0,
      dirty: { created: true, entries: [] },
      closed: null,
      farewell: [],
    };
    this.companies.set(id, company);
    this.seated.set(profile.profileId, { companyId: id, seat: leadSeat(state) });
    this.waiting.delete(profile.profileId);
    this.world = withCard(this.world, cardOf(id, state));

    const member = company.members[0];
    if (member === undefined) throw new Error("createCompany: no founder");
    return [...this.joinedMessages(company, member), ...this.lobbyBroadcast()];
  }

  joinCompany(profile: Profile, companyId: string): Out[] {
    this.requireFree(profile.profileId);
    const company = this.requireOpen(companyId);
    const site = this.bestSite(company);
    if (site === null) throw new WorldError("full", "This company has no free seat");
    return this.seat(company, profile, site);
  }

  recruit(recruiterId: string, targetId: string): Out[] {
    const held = this.seated.get(recruiterId);
    if (held === undefined) throw new WorldError("not-seated", "Only a seated player recruits");
    const company = this.requireCompany(held.companyId);
    const recruiter = this.memberAt(company, held.seat);
    if (recruiter === undefined)
      throw new WorldError("not-seated", "Only a seated player recruits");
    const name = this.waiting.get(targetId);
    if (name === undefined) throw new WorldError("not-waiting", "That player is no longer waiting");
    if (this.seated.has(targetId)) throw new WorldError("seated", "That player already has a seat");
    if (siteHeadcount(company.state, recruiter.site) >= siteSeats(company.state, recruiter.site)) {
      throw new WorldError("full", "Your site is full: buy a site or let a seat go first");
    }
    return this.seat(company, { profileId: targetId, name }, recruiter.site);
  }

  /** Seats a profile in a site: the log gets a join, the newcomer gets the company. */
  private seat(company: LiveCompany, profile: Profile, site: string): Out[] {
    const out: Out[] = [];
    const entry: CompanyEntry = { kind: "join", name: profile.name, site };
    let applied: StoredEntry;
    try {
      applied = this.apply(company, entry);
    } catch (error) {
      throw new WorldError("cannot-join", error instanceof Error ? error.message : "Cannot join");
    }
    const seat = Math.max(...occupiedSeats(company.state));
    const member: LiveMember = {
      profileId: profile.profileId,
      seat,
      name: profile.name,
      site,
      misses: 0,
      autopilot: false,
      autopilotRounds: 0,
      left: false,
      finalScore: 0,
    };
    company.members.push(member);
    this.seated.set(profile.profileId, { companyId: company.id, seat });
    this.waiting.delete(profile.profileId);

    out.push({
      to: { company: company.id, except: profile.profileId },
      message: { type: "entry.applied", ...applied },
    });
    out.push({
      to: { company: company.id, except: profile.profileId },
      message: { type: "seat.changed", member: this.dto(member), change: "joined" },
    });
    out.push(...this.joinedMessages(company, member));
    this.afterEntry(company, out);
    out.push(...this.lobbyBroadcast());
    return out;
  }

  leave(profileId: string): Out[] {
    const held = this.seated.get(profileId);
    if (held === undefined) throw new WorldError("not-seated", "You have no seat to leave");
    const company = this.requireCompany(held.companyId);
    const out: Out[] = [];
    const applied = this.apply(company, { kind: "leave", seat: held.seat });
    out.push({ to: { company: company.id }, message: { type: "entry.applied", ...applied } });
    this.afterEntry(company, out);
    out.push(...this.lobbyBroadcast());
    return out;
  }

  // -------------------------------------------------------------------- play

  /** A free action: applied at once, in the order it arrived. */
  act(profileId: string, action: PlayerAction): Out[] {
    const { company, member } = this.requireSeat(profileId);
    if (company.closed !== null) throw new WorldError("closed", "This company has closed");
    if (TURN_ACTIONS.has(action.type)) {
      throw new WorldError("turn-action", "That is a turn action: choose it for the round");
    }
    if (action.type === "choose_relic" || action.type === "answer") {
      throw new WorldError("vote", "The company decides this one by vote");
    }
    if (company.question !== null) {
      throw new WorldError("deciding", "The company is deciding: vote first");
    }
    if (!isActionAvailable(company.state, member.seat, action)) {
      throw new WorldError("illegal", `${action.type} is not available right now`);
    }

    this.seen(member);
    const out: Out[] = [];
    const applied = this.apply(company, {
      kind: "act",
      seat: member.seat,
      action: action as never,
    });
    out.push({ to: { company: company.id }, message: { type: "entry.applied", ...applied } });
    this.afterEntry(company, out);
    return out;
  }

  /** The turn action for this round: kept until the deadline, replaceable. */
  roundAct(profileId: string, round: number, action: PlayerAction): Out[] {
    const { company, member } = this.requireSeat(profileId);
    if (company.closed !== null) throw new WorldError("closed", "This company has closed");
    if (company.question !== null) {
      throw new WorldError("deciding", "The company is deciding: no round until the vote is in");
    }
    if (round !== company.round) {
      throw new WorldError(
        "stale-round",
        `That was for round ${round}, the company is on ${company.round}`,
      );
    }
    if (!TURN_ACTIONS.has(action.type)) {
      throw new WorldError("free-action", "That is not a turn action: send it as an act");
    }
    if (!isActionAvailable(company.state, member.seat, action)) {
      throw new WorldError("illegal", `${action.type} is not available right now`);
    }

    this.seen(member);
    company.pending.set(member.seat, action);
    return [
      { to: { profile: profileId }, message: { type: "round.ack", round } },
      {
        to: { company: company.id },
        message: {
          type: "round.progress",
          round,
          sent: [...company.pending.keys()].sort((a, b) => a - b),
        },
      },
    ];
  }

  vote(profileId: string, choice: string): Out[] {
    const { company, member } = this.requireSeat(profileId);
    const question = company.question;
    if (question === null) throw new WorldError("no-question", "Nothing is being voted on");
    if (!question.options.includes(choice)) {
      throw new WorldError("bad-choice", "That is not one of the options");
    }
    this.seen(member);
    question.votes.set(member.seat, choice);
    const out: Out[] = [
      {
        to: { company: company.id },
        message: { type: "question.votes", votes: this.tally(question) },
      },
    ];
    // Everybody who is there has voted: no reason to wait for the clock.
    const voters = company.members.filter((m) => !m.left && this.online.has(m.profileId));
    if (voters.length > 0 && voters.every((m) => question.votes.has(m.seat))) {
      this.resolveQuestion(company, out);
    }
    return out;
  }

  /** The client lost its place: send the company again if its hash is not ours. */
  resync(profileId: string, seq: number, hash: string): Out[] {
    const { company, member } = this.requireSeat(profileId);
    const mine = this.entryHash(company, seq);
    if (seq === company.seq && hash === company.hash) return [];
    if (mine !== undefined && mine === hash && seq < company.seq) {
      return this.joinedMessages(company, member);
    }
    return this.joinedMessages(company, member);
  }

  // -------------------------------------------------------------------- tick

  /**
   * One tick of the clock. Every company in id order: a company deciding gets
   * its vote counted, any other plays its round. The world moves once, first,
   * so every company is told about the same rivals and the same event.
   */
  tick(nextDeadline: number): Out[] {
    const out: Out[] = [];
    // Set first: a question opened during the tick closes at the next one.
    this.deadline = nextDeadline;
    const stepped = stepWorld(this.world);
    this.world = stepped.world;
    this.worldDirty = true;

    // Rivals are read before anybody advances, so the market is one picture.
    const before = this.world;
    for (const id of this.companyIds()) {
      const company = this.companies.get(id);
      if (company === undefined || company.closed !== null) continue;
      try {
        if (company.question !== null) this.resolveQuestion(company, out);
        else this.playRound(company, worldInputFor(before, id, stepped.event), out);
      } catch (error) {
        console.error(`realtime: company ${id} failed its tick`, error);
      }
    }
    this.openQuestions(out);
    for (const company of this.companies.values()) {
      if (company.closed === null && company.question === null) {
        out.push({
          to: { company: company.id },
          message: { type: "round.open", round: company.round, deadline: nextDeadline },
        });
      }
    }
    out.push(...this.lobbyBroadcast());
    return out;
  }

  /** Marks the first deadline, before any tick. */
  start(firstDeadline: number): void {
    this.deadline = firstDeadline;
  }

  private playRound(
    company: LiveCompany,
    world: { rivals: number[]; event?: import("@/game/content").WorldEventId },
    out: Out[],
  ): void {
    const substituted: Seat[] = [];
    const chosen: Record<string, PlayerAction | "missed"> = {};

    for (const member of company.members) {
      if (member.left) continue;
      const seat = member.seat;
      if (company.state.crew?.seats[seat] === undefined) continue;

      let turn: PlayerAction | undefined;
      const sent = company.pending.get(seat);
      if (member.autopilot) {
        const driven = driveSeat(company.state, seat, "supervisor");
        company.state = this.recordDriven(company, driven.entries, driven.state, out);
        turn = driven.turn;
      } else if (sent !== undefined && isActionAvailable(company.state, seat, sent)) {
        turn = sent;
      } else if (sent !== undefined) {
        // Legal when sent, not now: an earlier free action or seat changed the board.
        const driven = driveSeat(company.state, seat, "substitute");
        company.state = this.recordDriven(company, driven.entries, driven.state, out);
        turn = driven.turn;
        substituted.push(seat);
      }
      chosen[String(seat)] = turn ?? "missed";
    }

    const entry: CompanyEntry = { kind: "round", actions: chosen as never, world };
    const before = company.state;
    const result = applyEntry(before, entry);
    const applied = this.commit(company, entry, result.state, this.world.round);
    company.pending.clear();
    company.round += 1;
    company.roundsSinceSnapshot += 1;

    this.settleMisses(company, result.events, chosen);
    this.compact(company);

    out.push({
      to: { company: company.id },
      message: {
        type: "round.resolved",
        ...applied,
        substituted,
        misses: Object.fromEntries(
          company.members.filter((m) => !m.left).map((m) => [String(m.seat), m.misses]),
        ),
        autopilot: company.members.filter((m) => !m.left && m.autopilot).map((m) => m.seat),
      },
    });
    this.afterEntry(company, out);

    if (company.closed === null && company.round >= REALTIME_LIMITS.maxRounds) {
      this.close(company, "abandoned", out);
    }
  }

  private recordDriven(
    company: LiveCompany,
    entries: CompanyEntry[],
    state: RunState,
    out: Out[],
  ): RunState {
    // The driver applied these to a copy already; record them in the log in order.
    let replay = company.state;
    for (const entry of entries) {
      const result = applyEntry(replay, entry);
      replay = result.state;
      const applied = this.commit(company, entry, replay);
      out.push({ to: { company: company.id }, message: { type: "entry.applied", ...applied } });
    }
    if (hashState(replay) !== hashState(state)) {
      throw new Error("the driver and the log disagree");
    }
    return replay;
  }

  private settleMisses(
    company: LiveCompany,
    events: GameEvent[],
    chosen: Record<string, PlayerAction | "missed">,
  ): void {
    const missed = new Set<Seat>();
    for (const event of events) if (event.type === "seat_missed") missed.add(event.seat);

    for (const member of company.members) {
      if (member.left) continue;
      if (missed.has(member.seat)) {
        member.misses += 1;
        if (!member.autopilot && member.misses >= CREW_BALANCE.crew.missesBeforeAutopilot) {
          member.autopilot = true;
          member.autopilotRounds = 0;
        }
      } else if (chosen[String(member.seat)] !== "missed" && !member.autopilot) {
        member.misses = 0;
      }
      if (member.autopilot) member.autopilotRounds += 1;
    }
  }

  /** A seat that has been on the machine for long enough is released. */
  private releaseIdleSeats(company: LiveCompany, out: Out[]): void {
    for (const member of [...company.members]) {
      if (member.left || !member.autopilot) continue;
      if (member.autopilotRounds < CREW_BALANCE.crew.autopilotReleaseRounds) continue;
      if (company.closed !== null) return;
      const applied = this.apply(company, { kind: "leave", seat: member.seat });
      out.push({ to: { company: company.id }, message: { type: "entry.applied", ...applied } });
    }
  }

  // ---------------------------------------------------------------- questions

  private openQuestions(out: Out[]): void {
    for (const company of this.companies.values()) {
      if (company.closed === null) this.openQuestionIfNeeded(company, out);
    }
  }

  private openQuestionIfNeeded(company: LiveCompany, out: Out[]): void {
    if (company.question !== null) return;
    const phase = company.state.phase;
    if (phase.kind !== "choose_relic" && phase.kind !== "event") return;
    const lead = leadSeat(company.state);
    const options = getAvailableActions(company.state, lead).flatMap((action) =>
      action.type === "choose_relic"
        ? [action.relicId]
        : action.type === "answer"
          ? [action.choice]
          : [],
    );
    if (options.length === 0) return;
    company.question = {
      kind: phase.kind === "choose_relic" ? "relic" : "event",
      options,
      deadline: this.deadline,
      votes: new Map(),
    };
    out.push({
      to: { company: company.id },
      message: {
        type: "question.open",
        kind: company.question.kind,
        options,
        deadline: this.deadline,
      },
    });
  }

  private tally(question: Question): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const choice of question.votes.values()) counts[choice] = (counts[choice] ?? 0) + 1;
    return counts;
  }

  /** The winner takes the question: most votes, the first seat's pick on a tie, the first option on none. */
  private resolveQuestion(company: LiveCompany, out: Out[]): void {
    const question = company.question;
    if (question === null) return;
    const counts = this.tally(question);
    const best = Math.max(0, ...Object.values(counts));
    let winner = question.options[0];
    if (best > 0) {
      const tied = question.options.filter((option) => (counts[option] ?? 0) === best);
      const bySeat = [...question.votes.entries()].sort((a, b) => a[0] - b[0]);
      winner = bySeat.find(([, choice]) => tied.includes(choice))?.[1] ?? tied[0];
    }
    company.question = null;
    if (winner === undefined) return;

    const lead = leadSeat(company.state);
    const action = this.answerAction(company, lead, winner);
    out.push({
      to: { company: company.id },
      message: { type: "question.result", choice: winner, votes: counts },
    });
    if (action === undefined) return;
    const applied = this.apply(company, { kind: "act", seat: lead, action: action as never });
    out.push({ to: { company: company.id }, message: { type: "entry.applied", ...applied } });
    this.afterEntry(company, out);
  }

  private answerAction(company: LiveCompany, lead: Seat, choice: string): PlayerAction | undefined {
    return getAvailableActions(company.state, lead).find(
      (action) =>
        (action.type === "choose_relic" && action.relicId === choice) ||
        (action.type === "answer" && action.choice === choice),
    );
  }

  // -------------------------------------------------------------- log + state

  /** Applies an entry to the company, records it, and returns what to broadcast. */
  private apply(company: LiveCompany, entry: CompanyEntry): StoredEntry {
    const result = applyEntry(company.state, entry);
    return this.commit(company, entry, result.state);
  }

  private commit(
    company: LiveCompany,
    entry: CompanyEntry,
    state: RunState,
    worldRound?: number,
  ): StoredEntry {
    company.state = state;
    company.seq += 1;
    company.hash = hashState(state);
    const stored: StoredEntry = {
      seq: company.seq,
      ...(worldRound === undefined ? {} : { worldRound }),
      entry,
      hash: company.hash,
    };
    company.entries.push(stored);
    company.dirty.entries.push(stored);
    this.world = withCard(this.world, cardOf(company.id, state));
    return stored;
  }

  private compact(company: LiveCompany): void {
    if (company.roundsSinceSnapshot < REALTIME_LIMITS.snapshotEvery) return;
    company.snapshot = { seq: company.seq, state: structuredClone(company.state) };
    company.dirty.snapshot = company.snapshot;
    company.entries = [];
    company.roundsSinceSnapshot = 0;
  }

  /** Reconciles members with the seats the engine says are occupied, then closes a dead company. */
  private afterEntry(company: LiveCompany, out: Out[]): void {
    const occupied = new Set(occupiedSeats(company.state));
    for (const member of company.members) {
      if (member.left || occupied.has(member.seat)) continue;
      member.left = true;
      member.finalScore = company.state.crew?.left[member.seat]?.score ?? 0;
      this.seated.delete(member.profileId);
      member.autopilot = false;
      company.pending.delete(member.seat);
      const gone: Out = {
        to: { company: company.id },
        message: { type: "seat.changed", member: this.dto(member), change: "left" },
      };
      out.push(gone);
      // The one who left is no longer addressed as the company: tell them directly.
      out.push({
        to: { profile: member.profileId },
        message: { type: "seat.changed", member: this.dto(member), change: "left" },
      });
      if (this.online.has(member.profileId)) {
        out.push({ to: { profile: member.profileId }, message: this.lobbyState(member.profileId) });
      }
    }
    if (company.state.phase.kind === "game_over") {
      this.close(company, "dissolved", out);
      return;
    }
    this.releaseIdleSeats(company, out);
    this.openQuestionIfNeeded(company, out);
  }

  private close(
    company: LiveCompany,
    reason: "dissolved" | "abandoned" | "shutdown",
    out: Out[],
  ): void {
    if (company.closed !== null) return;
    company.closed = { reason };
    company.question = null;
    company.farewell = company.members.filter((m) => !m.left).map((m) => m.profileId);
    for (const member of company.members) {
      if (member.left) continue;
      member.left = true;
      member.finalScore = this.memberScore(company, member);
      this.seated.delete(member.profileId);
    }
    this.world = withoutCompany(this.world, company.id);
    out.push({ to: { company: company.id }, message: { type: "company.closed", reason } });
    for (const member of company.members) {
      if (this.online.has(member.profileId)) {
        out.push({ to: { profile: member.profileId }, message: this.lobbyState(member.profileId) });
      }
    }
  }

  /** Closes everything for a clean stop: the sockets are told, the writes are drained. */
  shutdown(): Out[] {
    const out: Out[] = [];
    for (const company of this.companies.values()) {
      if (company.closed === null) {
        out.push({
          to: { company: company.id },
          message: { type: "company.closed", reason: "shutdown" },
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ ranking

  ranking(profileId: string): ServerMessage {
    const open = this.openCompanies();
    const companies: RankableCompany[] = open.map((company) => ({
      id: company.id,
      name: company.name,
      score: this.scoreOf(company),
      members: occupiedSeats(company.state).length,
    }));
    const players: RankablePlayer[] = open.flatMap((company) =>
      company.members.map((member) => ({
        profileId: member.profileId,
        name: member.name,
        company: company.name,
        score: this.memberScore(company, member),
      })),
    );
    const held = this.seated.get(profileId);
    const ranked = rankingFor(companies, players, {
      profileId,
      companyId: held?.companyId ?? null,
    });
    return { type: "ranking", ...ranked };
  }

  private memberScore(company: LiveCompany, member: LiveMember): number {
    if (member.left) return member.finalScore;
    return company.state.crew?.seats[member.seat] === undefined
      ? member.finalScore
      : playerScore(company.state, member.seat);
  }

  private scoreOf(company: LiveCompany): number {
    return this.world.companies[company.id]?.score ?? 0;
  }

  // ------------------------------------------------------------- persistence

  /** What changed since the last drain, for the store: take it, then commit it. */
  drainWrites(): { world?: WorldCursor; companies: CompanyWrite[] } {
    const companies: CompanyWrite[] = [];
    for (const company of this.companies.values()) {
      const { dirty } = company;
      const changed = dirty.created || dirty.entries.length > 0 || company.closed !== null;
      if (!changed && dirty.snapshot === undefined) continue;
      const write: CompanyWrite = {
        id: company.id,
        entries: dirty.entries,
        score: this.scoreOf(company),
        seq: company.seq,
        status: company.closed === null ? "open" : "closed",
        members: company.members.map((member) => this.stored(company, member)),
        ...(dirty.created
          ? {
              created: {
                name: company.name,
                start: company.start,
                rulesEpoch: company.rulesEpoch,
                crewEpoch: company.crewEpoch,
              },
            }
          : {}),
        ...(company.closed === null ? {} : { closeReason: company.closed.reason }),
        ...(dirty.snapshot === undefined ? {} : { snapshot: dirty.snapshot }),
      };
      companies.push(write);
      company.dirty = { created: false, entries: [] };
    }
    const world = this.worldDirty ? this.cursor() : undefined;
    this.worldDirty = false;
    // A closed company is written once and forgotten.
    for (const [id, company] of this.companies)
      if (company.closed !== null) this.companies.delete(id);
    return world === undefined ? { companies } : { world, companies };
  }

  /** Puts writes back at the front after a failed commit, so nothing is lost. */
  // (The server keeps the failed batch itself; see `Persister`.)

  private stored(company: LiveCompany, member: LiveMember): StoredMember {
    return {
      profileId: member.profileId,
      seat: member.seat,
      name: member.name,
      site: member.site,
      left: member.left,
      finalScore: this.memberScore(company, member),
      missesInRow: member.misses,
      autopilot: member.autopilot,
    };
  }

  // ----------------------------------------------------------------- helpers

  private openCompanies(): LiveCompany[] {
    return [...this.companies.values()]
      .filter((company) => company.closed === null)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  private freeSeats(company: LiveCompany): number {
    let free = 0;
    for (const site of Object.keys(company.state.crew?.sites ?? {})) {
      free += Math.max(0, siteSeats(company.state, site) - siteHeadcount(company.state, site));
    }
    return free;
  }

  /** The site with the most free seats; the earliest on a tie. Null when full. */
  private bestSite(company: LiveCompany): string | null {
    let best: string | null = null;
    let bestFree = 0;
    for (const site of Object.keys(company.state.crew?.sites ?? {})) {
      const free = siteSeats(company.state, site) - siteHeadcount(company.state, site);
      if (free > bestFree) {
        best = site;
        bestFree = free;
      }
    }
    return best;
  }

  private requireFree(profileId: string): void {
    if (this.seated.has(profileId)) {
      throw new WorldError("seated", "You already have a seat: leave it first");
    }
  }

  private requireCompany(id: string): LiveCompany {
    const company = this.companies.get(id);
    if (company === undefined) throw new WorldError("no-company", "That company does not exist");
    return company;
  }

  private requireOpen(id: string): LiveCompany {
    const company = this.requireCompany(id);
    if (company.closed !== null) throw new WorldError("closed", "That company has closed");
    return company;
  }

  private requireSeat(profileId: string): { company: LiveCompany; member: LiveMember } {
    const held = this.seated.get(profileId);
    if (held === undefined) throw new WorldError("not-seated", "You have no seat in a company");
    const company = this.requireCompany(held.companyId);
    const member = this.memberAt(company, held.seat);
    if (member === undefined) throw new WorldError("not-seated", "You have no seat in a company");
    return { company, member };
  }

  private memberAt(company: LiveCompany, seat: Seat): LiveMember | undefined {
    return company.members.find((member) => member.seat === seat && !member.left);
  }

  /** The player is back: whatever they send ends their misses and the machine's turn. */
  private seen(member: LiveMember): void {
    member.misses = 0;
    member.autopilot = false;
    member.autopilotRounds = 0;
  }

  private entryHash(company: LiveCompany, seq: number): string | undefined {
    return company.entries.find((row) => row.seq === seq)?.hash;
  }

  private status(member: LiveMember): SeatStatus {
    if (member.autopilot) return "autopilot";
    return this.online.has(member.profileId) ? "online" : "offline";
  }

  private dto(member: LiveMember): MemberDto {
    return {
      seat: member.seat,
      profileId: member.profileId,
      name: member.name,
      site: member.site,
      status: this.status(member),
    };
  }

  private statusChange(company: LiveCompany, member: LiveMember): Out {
    return {
      to: { company: company.id, except: member.profileId },
      message: { type: "seat.changed", member: this.dto(member), change: "status" },
    };
  }

  /** Everything a player needs to be in a company: the start, the entries, who is there. */
  private joinedMessages(company: LiveCompany, member: LiveMember): Out[] {
    const to = { profile: member.profileId };
    const out: Out[] = [
      {
        to,
        message: {
          type: "company.joined",
          companyId: company.id,
          seat: member.seat,
          site: member.site,
          start: {
            seed: company.start.seed,
            name: company.start.name,
            founder: company.start.founder,
            profileId: company.start.profileId,
            unlockedSkills: company.start.unlockedSkills,
            startingSkillPoints: company.start.startingSkillPoints,
          },
          ...(company.snapshot === null
            ? {}
            : {
                snapshot: {
                  seq: company.snapshot.seq,
                  state: company.snapshot.state as unknown as Record<string, unknown>,
                },
              }),
          entries: company.entries.map((row) => ({
            seq: row.seq,
            entry: row.entry,
            hash: row.hash,
          })),
          members: company.members.filter((m) => !m.left).map((m) => this.dto(m)),
          round: { round: company.round, deadline: this.deadline },
        },
      },
    ];
    if (company.question !== null) {
      out.push({
        to,
        message: {
          type: "question.open",
          kind: company.question.kind,
          options: company.question.options,
          deadline: company.question.deadline,
        },
      });
    }
    return out;
  }
}
