import {
  DEVOPS_IDS,
  type DevopsId,
  freeFeatureSkills,
  PROFILES,
  type ProfileId,
  type SkillId,
} from "@/game/content";
import { canonicalJson, fnv1a } from "@/game/core/hash";
import { generateSprint } from "@/game/core/map/generate";
import { spawnBotsForSprint } from "@/game/core/rules/bots";
import { createContext } from "@/game/core/rules/context";
import { energyMax } from "@/game/core/rules/modifiers";
import { arriveAt } from "@/game/core/rules/progress";
import { availableSkills } from "@/game/core/rules/sprint";
import type { RunMode, RunState, StatPoints } from "@/game/core/types";

export interface RunMeta {
  /** Feature skills this account has unlocked. Defaults to the starter set. */
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
 * A fresh run at turn 0, standing on the first sprint's anchor.
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
    sprintLength: 0,

    nodes: {},
    branches: {},
    nextNodeSerial: 0,
    nextBranchSerial: 0,

    player: {
      nodeId: "",
      energy: 0,
      energyMax: 0,
      sprintProgress: 0,
      totalCommits: 0,
      zeroEnergyStreak: 0,
      overtakenStreak: 0,
      aiHistory: [],
      aiChain: 0,
      rerollUsed: false,
      turnsSinceFreeReview: 0,
      freeRefactor: false,
    },
    bots: {},
    nextBotSerial: 1,

    skills: [...profile.startingSkills].sort(),
    unlockedSkills: [...(options.meta?.unlockedSkills ?? defaultUnlockedSkills())].sort(),
    statPoints,
    relics: [],
    devops,
    devopsPoints: 0,

    debt: 0,
    debtNoise: 0,

    monitoringWarning: false,
    botsFired: 0,
    xpEarned: 0,

    phase: { kind: "choose_action" },
    log: [],
    nextLogSeq: 0,
  };

  const context = createContext(state);

  state.player.energyMax = energyMax(state, context.effects);
  state.player.energy = state.player.energyMax;

  const plan = generateSprint({
    sprint: 1,
    offset: 0,
    skillPool: availableSkills(state.unlockedSkills, state.skills),
    rng: context.rng,
    serial: { next: 0 },
    branchSerial: { next: 0 },
  });

  for (const node of plan.nodes) state.nodes[node.id] = node;
  for (const branch of plan.branches) state.branches[branch.id] = branch;

  state.nextNodeSerial = plan.nodes.length;
  state.nextBranchSerial = plan.branches.length;
  state.sprintLength = plan.length;

  spawnBotsForSprint(context);
  arriveAt(context, plan.startId);

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
