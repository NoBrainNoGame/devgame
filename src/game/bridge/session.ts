import { Emitter } from "@/game/bridge/emitter";
import { holdFor, readout } from "@/game/bridge/gauges";
import { advancePushes, emptyPushes, type PushLedger, type PushOp } from "@/game/bridge/pushes";
import { rebuildRun } from "@/game/bridge/rebuild";
import { type RunSnapshot, toSnapshot } from "@/game/bridge/snapshot";
import { gameStore } from "@/game/bridge/store";
import { achievementsInRun } from "@/game/core/achievements";
import { isActionAvailable } from "@/game/core/rules/actions";
import { SOLO_SEAT, siteView, ticketVisibleAt, visibleNodeIds } from "@/game/core/rules/crew";
import { applyAction } from "@/game/core/rules/reducer";
import { hashState, type ShowcaseOptions } from "@/game/core/run";
import { accountSkillPoints } from "@/game/core/score";
import type { GameEvent, PlayerAction, RunState, Seat, SiteId } from "@/game/core/types";
import { applyEntry, type CompanyEntry, type CompanyStart, startCompany } from "@/game/dto/company";
import type { MetaProgressDto } from "@/game/dto/meta";
import type { RunSaveDto } from "@/game/dto/run";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

/**
 * Owns the live run: the state, the ordered action log that *is* the save, and
 * the store the UI reads.
 *
 * It is an `Emitter` so Booyah chips can `_subscribe` to it and be
 * unsubscribed automatically when they terminate.
 */

export interface AppliedPayload {
  events: GameEvent[];
  state: RunState;
  /**
   * The action that produced them: a purchase is told differently from a turn.
   * Absent when it was a round, or somebody else's entry, with none of mine in it.
   */
  action?: PlayerAction;
  /** This publication's number, so a late effect can tell it belongs to an older one. */
  batch: number;
  /** What the batch pushed, in the order the story tells it. */
  pushes: PushOp[];
  /**
   * Where the action was taken, in page coordinates, when it was taken in a
   * dialog over the canvas: what it gives flies from there to the HUD.
   */
  origin?: { x: number; y: number };
}

/**
 * How the run is being shown right now, which the scene decides and may
 * change at any moment: with no WebGL scene up, nothing animates, so nothing
 * may ever be waited for.
 */
export interface Presentation {
  animated: boolean;
  /**
   * Whether the HUD holds its gauges until the canvas shows how they moved.
   * Only with pops on screen to release them.
   */
  holdGauges: boolean;
}

/**
 * A session in a company: the state is built from what the server sent and
 * moved only by the entries it sends after. Nothing the player does is
 * applied here — it is sent, and applied when its echo comes back, the same
 * for everybody and in the same order.
 */
export interface CompanyOptions {
  start: CompanyStart;
  site: SiteId;
  /** A compaction to start from instead of the beginning. */
  snapshot?: RunState;
  /** Entries after the snapshot (or after the beginning). */
  entries: readonly CompanyEntry[];
  /** Hands an action to the server. */
  send: (action: PlayerAction) => DispatchResult;
}

export interface SessionOptions {
  seed: string;
  mode: "classic" | "daily";
  profileId: MetaProgressDto["unlockedProfiles"][number];
  meta: MetaProgressDto;
  clientRunId: string;
  createdAt: string;
  /** The human this session plays. Absent: the solo seat. */
  seat?: Seat;
  /** Present: a company's session, not a solo run. */
  company?: CompanyOptions;
  /** Replays a previously saved log, so a reload resumes where it left off. */
  resumeActions?: readonly PlayerAction[];
  /** The landing page's run: a team from turn 1, and no way to lose. */
  showcase?: ShowcaseOptions;
  /**
   * The skill points the run started with, when they are known rather than
   * derived from the account: a saved run replayed for inspection has to
   * start exactly where it started.
   */
  startingSkillPoints?: number;
}

export type DispatchResult = { ok: true } | { ok: false; reason: string };

export class GameSession extends Emitter {
  private readonly actionLog: PlayerAction[] = [];
  private readonly entryLog: CompanyEntry[] = [];
  private state: RunState;
  /** The scene's picture of a company's state: the other sites' branches taken out. */
  private view: { of: RunState; state: RunState } | null = null;
  private pushes: PushLedger = emptyPushes();
  private presentation: Presentation = { animated: true, holdGauges: false };
  private batch = 0;

  constructor(private readonly options: SessionOptions) {
    super();
    const { company } = options;
    if (company !== undefined) {
      this.state = company.snapshot ?? startCompany(company.start);
      for (const entry of company.entries) {
        const result = applyEntry(this.state, entry);
        this.state = result.state;
        this.entryLog.push(entry);
        this.pushes = advancePushes(this.pushes, result.events, this.state).ledger;
      }
      this.publish();
      return;
    }

    const rebuilt = rebuildRun(
      {
        seed: options.seed,
        mode: options.mode,
        profileId: options.profileId,
        version: SAVE_VERSION,
        meta: {
          unlockedSkills: options.meta.unlockedSkills,
          startingSkillPoints:
            options.startingSkillPoints ?? accountSkillPoints(options.meta.level),
        },
        ...(options.showcase === undefined ? {} : { showcase: options.showcase }),
      },
      options.resumeActions ?? [],
      (events, state) => {
        this.pushes = advancePushes(this.pushes, events, state).ledger;
      },
    );
    this.state = rebuilt.state;
    this.actionLog.push(...rebuilt.replayed);

    this.publish();
  }

  get seat(): Seat {
    return this.options.seat ?? SOLO_SEAT;
  }

  /** What the scene draws from: in a company, the state as the viewer's site sees it. */
  getState(): RunState {
    const { company } = this.options;
    if (company === undefined) return this.state;
    if (this.view?.of !== this.state) {
      this.view = { of: this.state, state: siteView(this.state, company.site) };
    }
    return this.view.state;
  }

  /** The state the rules run on, in full: for the hash and the checks, never for drawing. */
  getRawState(): RunState {
    return this.state;
  }

  /** Whether the session plays a company. */
  get isCompany(): boolean {
    return this.options.company !== undefined;
  }

  getEntries(): CompanyEntry[] {
    return [...this.entryLog];
  }

  /** Which of the run's commits are pushed, as the graph ends a batch. */
  getPushes(): PushLedger {
    return this.pushes;
  }

  getActions(): PlayerAction[] {
    return [...this.actionLog];
  }

  /**
   * Applies an action and tells the scene about it.
   *
   * Refused while the canvas is still animating the previous one: letting a
   * second action land mid-sequence would play the two out of order, and the
   * player would see a commit resolve before the node it happened on appeared.
   */
  dispatch(action: PlayerAction, origin?: { x: number; y: number }): DispatchResult {
    const { company } = this.options;
    if (company !== undefined) {
      // Sending is not applying: the canvas may still be playing the last entry.
      if (!isActionAvailable(this.state, this.seat, action)) {
        return { ok: false, reason: "illegal" };
      }
      return company.send(action);
    }
    if (gameStore.getState().pendingAnimation) {
      return { ok: false, reason: "animating" };
    }
    if (!isActionAvailable(this.state, this.seat, action)) {
      return { ok: false, reason: "illegal" };
    }

    const result = applyAction(this.state, action, this.seat);
    this.state = result.state;
    this.actionLog.push(action);
    const pushed = advancePushes(this.pushes, result.events, result.state);
    this.pushes = pushed.ledger;

    this.batch += 1;
    this.publish(result.events, action);
    const payload: AppliedPayload = {
      events: result.events,
      state: result.state,
      action,
      batch: this.batch,
      pushes: pushed.ops,
      ...(origin === undefined ? {} : { origin }),
    };
    this.emit("applied", payload);

    return { ok: true };
  }

  /**
   * An entry the server sent, applied to the company and played on the canvas.
   * False when the rules refuse it, which means this client drifted.
   */
  applyEntry(entry: CompanyEntry): boolean {
    const { company } = this.options;
    if (company === undefined) throw new Error("applyEntry: a solo run has no entries");
    let result: { state: RunState; events: GameEvent[] };
    try {
      result = applyEntry(this.state, entry);
    } catch {
      return false;
    }
    this.state = result.state;
    this.entryLog.push(entry);
    const pushed = advancePushes(this.pushes, result.events, result.state);
    this.pushes = pushed.ledger;

    const mine = this.myAction(entry);
    this.batch += 1;
    this.publish(result.events, mine);
    const payload: AppliedPayload = {
      events: result.events,
      state: this.getState(),
      batch: this.batch,
      pushes: pushed.ops,
      ...(mine === undefined ? {} : { action: mine }),
    };
    this.emit("applied", payload);
    return true;
  }

  /** The hash of the state the rules run on, to compare with the server's. */
  hash(): string {
    return hashState(this.state);
  }

  /** My part of an entry: the action I took in it, when I took one. */
  private myAction(entry: CompanyEntry): PlayerAction | undefined {
    if (entry.kind === "act")
      return entry.seat === this.seat ? (entry.action as PlayerAction) : undefined;
    if (entry.kind === "round") {
      const chosen = entry.actions[String(this.seat)];
      return chosen === undefined || chosen === "missed" ? undefined : (chosen as PlayerAction);
    }
    return undefined;
  }

  /** The whole run, small enough to put in `localStorage` or a JSON column. */
  save(): RunSaveDto {
    if (this.options.company !== undefined) {
      throw new Error("A company has no local save: the server keeps it");
    }
    return {
      version: SAVE_VERSION,
      rules: RULES_FINGERPRINT,
      seed: this.options.seed,
      mode: this.options.mode,
      profileId: this.options.profileId,
      // Read back from the state, not from `options.meta`: a profile merged
      // from another tab mid-run must not change what this run claims.
      unlockedSkills: [...this.state.unlockedSkills],
      startingSkillPoints: this.state.startingSkillPoints,
      actions: this.getActions(),
      clientRunId: this.options.clientRunId,
      createdAt: this.options.createdAt,
    };
  }

  /** Pushes the current state into the store. Public so the mount can republish. */
  publish(events: GameEvent[] = [], action?: PlayerAction): void {
    const isOver = this.state.phase.kind === "game_over";

    const review = events.find((event) => event.type === "pr_reviewed");
    const snapshot = this.snapshotOf();
    // The gauges keep their old values until the canvas shows them moving.
    const previous = gameStore.getState().snapshot;
    const heldGauges =
      this.presentation.holdGauges && action !== undefined && previous !== null && events.length > 0
        ? holdFor(readout(previous), readout(snapshot), action, this.batch)
        : null;

    gameStore.setState({
      status: isOver ? "game_over" : "running",
      snapshot,
      heldGauges,
      ...(review === undefined ? {} : { pendingReview: review }),
      // Nothing to watch means nothing to wait for; the scene clears this once
      // it has played whatever it was given. With no scene animating — WebGL
      // lost, or given up for Canvas2D — nothing is ever waited for.
      pendingAnimation: this.presentation.animated && events.length > 0,
      log: [...this.state.log],
      lastEvents: events,
      // Only for an action taken now: a replayed log earns nothing twice.
      lastAchievements:
        action === undefined ? [] : achievementsInRun({ state: this.state, events, action }),
      lastError: null,
    });
  }

  /** The HUD's view: the engine's snapshot, with the other sites' branches and tickets left out. */
  private snapshotOf(): RunSnapshot {
    const snapshot = toSnapshot(this.state, this.seat);
    const { company } = this.options;
    if (company === undefined) return snapshot;
    const visible = visibleNodeIds(this.state, company.site);
    const board = new Set(
      Object.values(this.state.tickets)
        .filter((ticket) => ticketVisibleAt(this.state, ticket, company.site))
        .map((ticket) => ticket.id),
    );
    return {
      ...snapshot,
      nodes: Object.fromEntries(Object.entries(snapshot.nodes).filter(([id]) => visible.has(id))),
      tickets: snapshot.tickets
        .filter((ticket) => board.has(ticket.id))
        .map((ticket) => ({ ...ticket, nodeIds: ticket.nodeIds.filter((id) => visible.has(id)) })),
    };
  }

  /** Changes how the run is shown, live: the scene may come and go under it. */
  setPresentation(next: Partial<Presentation>): void {
    this.presentation = { ...this.presentation, ...next };
  }

  /**
   * Drops every subscriber. A scene torn down after a throw inside a frame
   * never runs its chips' own teardown, so it cannot be trusted to have
   * unsubscribed itself.
   */
  detachListeners(): void {
    this.clearListeners();
  }

  destroy(): void {
    this.clearListeners();
  }
}
