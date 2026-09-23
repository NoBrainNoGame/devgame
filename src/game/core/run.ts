import {
  freeFeatureSkills,
  PROFILES,
  type ProfileId,
  type SkillId,
  TICKET_KINDS,
  type TicketKind,
  TREE_IDS,
  type TreeNodeId,
  UPGRADE_IDS,
  type UpgradeId,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { canonicalJson, fnv1a } from "@/game/core/hash";
import { arriveTickets } from "@/game/core/map/tickets";
import { createContext } from "@/game/core/rules/context";
import { initialMarket } from "@/game/core/rules/market";
import { energyMax } from "@/game/core/rules/modifiers";
import { drawObjective } from "@/game/core/rules/objectives";
import { availableSkills } from "@/game/core/rules/sprint";
import { writeSprintStart } from "@/game/core/rules/write";
import type { RunMode, RunState } from "@/game/core/types";

export interface RunMeta {
  /** Skills this account has unlocked. Defaults to the starter set. */
  unlockedSkills?: readonly SkillId[];
  /** Skill points the account's level grants at the start. Defaults to none. */
  startingSkillPoints?: number;
}

export interface CreateRunOptions {
  /** Any string. Hashed into the PRNG cursor, and shown to the player as-is. */
  seed: string;
  mode: RunMode;
  profileId: ProfileId;
  meta?: RunMeta;
  version: number;
}

/** Skills available to an account that has unlocked nothing yet. */
export function defaultUnlockedSkills(): SkillId[] {
  return freeFeatureSkills();
}

/**
 * A fresh run at turn 1: `dev` opened, the first sprint's tickets in the
 * backlog, nothing in hand.
 *
 * Everything past this point is a pure function of the seed and the actions,
 * which is what `replayRun` depends on. Nothing here may read the clock or the
 * environment.
 */
export function createRun(options: CreateRunOptions): RunState {
  const { seed, mode, profileId, version } = options;
  const profile = PROFILES[profileId];

  const tree = Object.fromEntries(TREE_IDS.map((id) => [id, 0])) as Record<TreeNodeId, number>;
  for (const [id, level] of Object.entries(profile.startingTree)) {
    if (level !== undefined) tree[id as TreeNodeId] = level;
  }

  const startingSkillPoints = Math.max(0, Math.floor(options.meta?.startingSkillPoints ?? 0));

  const state: RunState = {
    version,
    seed,
    mode,
    profileId,

    rng: { s: fnv1a(seed) | 0 },
    turn: 1,
    sprint: 1,
    sprintTurn: 0,

    nodes: {},
    nextNodeSerial: 0,
    nextDepth: 0,

    tickets: {},
    nextTicketSerial: 1,
    devMerges: 0,
    shipped: [],

    player: {
      ticketId: null,
      energy: 0,
      energyMax: 0,
      totalCommits: 0,
      zeroEnergyStreak: 0,
      aiChain: 0,
      rerollUsed: false,
      turnsSinceFreeReview: 0,
      freeRefactor: false,
      docsCharges: 0,
    },

    skills: [...profile.startingSkills].sort(),
    unlockedSkills: [...(options.meta?.unlockedSkills ?? defaultUnlockedSkills())].sort(),
    startingSkillPoints,
    relics: [],
    tree,
    skillPoints: startingSkillPoints,
    skillPointsBought: 0,

    money: BALANCE.economy.startingMoney,
    moneyEarned: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>,
    devs: [],
    nextDevSerial: 1,
    months: 0,
    tier: 0,
    acquisitions: [],
    capacityAlert: "ok",
    finance: [],
    hackSprint: null,
    market: initialMarket(),
    narrative: { lastTurn: -1000, fired: [] },
    flags: { humanReviewOptional: false, operatorChannelClosed: false, vipForTeam: false },
    sprintMonths: 0,
    sprintPlayerDelivered: 0,
    objective: null,
    sprintCounters: { rests: 0, aiCommits: 0, vipDelivered: 0, bugsDelivered: 0 },

    debt: 0,
    debtNoise: 0,

    monitoringWarning: false,
    quality: 0,
    sprintIncidents: 0,
    sprintForced: false,
    stats: {
      incidents: 0,
      outages: 0,
      rejections: 0,
      staleForced: 0,
      idleSprints: 0,
      devsLeft: 0,
      moneyLost: 0,
      qualityBySource: {
        incident: 0,
        rejection: 0,
        stale: 0,
        outage: 0,
        idle_sprint: 0,
        deadline: 0,
        event: 0,
        objective: 0,
      },
      lastQualitySource: null,
      commitsTried: { craft: 0, ai: 0 },
      commitsLanded: { craft: 0, ai: 0 },
      reviews: 0,
      rests: 0,
      hacks: { tried: 0, won: 0 },
      answers: {},
      objectives: {},
      arrivedByKind: emptyKinds(),
      deliveredByPlayer: emptyKinds(),
      deliveredByTeam: 0,
      deadlinesMissed: 0,
      moneyPeak: BALANCE.economy.startingMoney,
      tierSprint: {},
      hires: 0,
    },

    xpEarned: 0,
    pointsDelivered: 0,
    ticketsDelivered: 0,

    phase: { kind: "choose_action" },
    log: [],
    nextLogSeq: 0,
  };

  const context = createContext(state);

  state.player.energyMax = energyMax(state, context.effects);
  state.player.energy = state.player.energyMax;

  writeSprintStart(context);
  arriveTickets(context, availableSkills(state));
  drawObjective(context);

  // The setup events describe a board nobody has seen yet, so they are dropped
  // rather than logged: the log starts when the player does.
  state.log = [];

  return state;
}

/**
 * A fingerprint of everything that decides what happens next. The log is
 * excluded — it is derived, and a translated line must not change the hash.
 */
export function hashState(state: RunState): string {
  const { log: _log, ...rest } = state;
  return fnv1a(canonicalJson(rest)).toString(16).padStart(8, "0");
}

/** One zero per kind of ticket, for the counters that break down by kind. */
function emptyKinds(): Record<TicketKind, number> {
  return Object.fromEntries(TICKET_KINDS.map((kind) => [kind, 0])) as Record<TicketKind, number>;
}
