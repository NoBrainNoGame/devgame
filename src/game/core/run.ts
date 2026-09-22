import {
  DEVOPS_IDS,
  type DevopsId,
  freeFeatureSkills,
  PROFILES,
  type ProfileId,
  type SkillId,
} from "@/game/content";
import { canonicalJson, fnv1a } from "@/game/core/hash";
import { arriveTickets } from "@/game/core/map/tickets";
import { createContext } from "@/game/core/rules/context";
import { energyMax } from "@/game/core/rules/modifiers";
import { availableSkills } from "@/game/core/rules/sprint";
import { writeSprintStart } from "@/game/core/rules/write";
import type { RunMode, RunState, StatPoints } from "@/game/core/types";

export interface RunMeta {
  /** Skills this account has unlocked. Defaults to the starter set. */
  unlockedSkills?: readonly SkillId[];
  statPoints?: Partial<StatPoints>;
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

  const devops = Object.fromEntries(DEVOPS_IDS.map((id) => [id, 0])) as Record<DevopsId, number>;
  for (const [id, level] of Object.entries(profile.startingDevops)) {
    if (level !== undefined) devops[id as DevopsId] = level;
  }

  const statPoints: StatPoints = {
    energyMax: options.meta?.statPoints?.energyMax ?? 0,
    luck: options.meta?.statPoints?.luck ?? 0,
    conflictRes: options.meta?.statPoints?.conflictRes ?? 0,
  };

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
    statPoints,
    relics: [],
    devops,
    devopsPoints: 0,

    debt: 0,
    debtNoise: 0,

    monitoringWarning: false,
    quality: 0,
    sprintIncidents: 0,

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
