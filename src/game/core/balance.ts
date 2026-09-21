import type { CommitMode, NodeKind } from "@/game/core/types";

/**
 * Every tunable number in the game. Nothing else in `src/game` may contain a
 * bare magic constant: a literal buried in a rule is a number nobody will ever
 * find again when the game plays badly.
 *
 * These are starting values, not measured ones. `bun run sim` plays a few
 * hundred headless runs and prints the distributions they produce.
 *
 * Changing anything here changes what a recorded action log means, which is why
 * `SAVE_VERSION` in `src/game/dto/version.ts` is derived from a hash of this
 * module. An old save then loads read-only instead of scoring wrong.
 */
export const BALANCE = {
  /** Main-line nodes per sprint, inclusive. */
  sprintLength: { min: 12, max: 18 },

  energy: {
    base: 16,
    /** Energy spent to resolve a node, by kind. */
    cost: {
      sprint_start: 0,
      commit: 0,
      refactor: 2,
      risky: 1,
      chore: 1,
      fork: 0,
      feature: 0,
      feature_merge: 2,
      hotfix: 0,
      sprint_merge: 2,
      release: 0,
    } satisfies Record<NodeKind, number>,
    /** Added on top of the node cost, by how you chose to write the commit. */
    commitCost: { craft: 2, ai: 1 } satisfies Record<CommitMode, number>,
    reviewCost: 2,
    /** Energy returned by merging a feature branch and by a sprint merge. */
    featureMergeRegen: 7,
    sprintMergeRegen: 8,
    /** Fraction of the maximum handed back when a sprint closes. */
    sprintEndRegenRatio: 1,
    /** At or below this, every roll takes the crunch malus. */
    crunchThreshold: 4,
    crunchMalusPoints: 15,
    /** Turns finished at zero energy before the run ends in burnout. */
    burnoutStreak: 2,
    /** A second open feature branch multiplies every energy cost. */
    secondBranchCostMultiplier: 2,
  },

  commit: {
    /** Base success chance in percent, before any modifier. */
    base: { craft: 92, ai: 70 } satisfies Record<CommitMode, number>,
    /** Replaces the base chance on a `risky` node. */
    riskyBase: 78,
    /** Success chance is reduced by `debt / debtRiskDivisor` points. */
    debtRiskDivisor: 4,
    /** A second open feature branch costs this many points on every roll. */
    secondBranchMalusPoints: 15,
    /** Success is never certain and never hopeless. */
    clamp: { min: 5, max: 95 },
    /** Extra nodes a successful AI commit walks through, inclusive. */
    aiJump: { min: 1, max: 2 },
    /** Chance in percent that a craft success makes the next refactor free. */
    craftFreeRefactorPct: 25,
    /** Chance in percent that a success also draws an ambient event. */
    ambientOnSuccessPct: 10,
  },

  debt: {
    max: 100,
    /** Debt added by resolving a node, on success. */
    perAiCommit: 9,
    /** Debt for each extra node an AI burst walked through. */
    perAiJumpNode: 3,
    perCraftCommit: 0,
    perRiskyNode: 5,
    perAiConflictFix: 10,
    /** Debt repaid by a refactor node. */
    refactorRepay: 10,
    /** Half-width of the noise added to the displayed range. */
    noiseSpread: 7,
    /** Half-width of the range itself, before the noise. */
    fuzzSpread: 10,
    /** The range is rounded outwards to a multiple of this. */
    fuzzStep: 5,
    /** At or above this, mandatory refactor nodes are injected. */
    explosionThreshold: 70,
    explosionNodes: 2,
    explosionRepay: 30,
  },

  review: {
    /** AI commits a single review cleans up. */
    cleans: 3,
    /** Extra commits cleaned when the chain bonus applies. */
    chainBonus: 2,
    /** Consecutive AI commits needed for the chain bonus. */
    chainLength: 3,
    /** Debt repaid per commit cleaned. */
    repayPerCommit: 4,
    /** How many recent AI commits count towards the reviewed ratio. */
    window: 10,
    /** DevOps review bot cadence at one point; each further point removes one. */
    botCadence: 4,
  },

  failure: {
    /** Energy lost resolving a merge conflict by hand. */
    conflictManualEnergy: 3,
    /** Base chance in percent of resolving a conflict by hand. */
    conflictManualBase: 75,
    /** Chance in percent that an AI conflict fix plants a hidden bug. */
    conflictAiHiddenBugPct: 30,
    /** Nodes in a hotfix branch, and how many monitoring removes. */
    hotfixNodes: 3,
    hotfixNodesWithMonitoring: 2,
    /** Progress lost to a rejected pull request. */
    prRejectedProgress: 1,
    /** How much a good reviewed ratio damps the Reviewer's weight. */
    reviewedRatioDamping: 0.5,
  },

  bots: {
    /** Bots present at sprint 1, and the cap. */
    startCount: 1,
    perSprint: 1,
    max: 4,
    /** Added to a newcomer's pace for every sprint already survived. */
    speedPerSprint: 12,
    /** Reputation the player must hold to make progress towards firing a bot. */
    firingReputationThreshold: 4,
    /** How far a bot must be ahead to count as overtaking the player. */
    overtakenGap: 4,
    /** Turns overtaken before the player is fired. */
    overtakenStreak: 6,
    /** XP for a firing, multiplied by the sprint it happened in. */
    firingXpPerSprint: 50,
    /** Commits credited for a firing. */
    firingCommits: 3,
  },

  reputation: {
    /** Reputation floor of the quality multiplier, at a 0 % reviewed ratio. */
    qualityFloor: 0.5,
    /** How much a perfect reviewed ratio adds on top of the floor. */
    qualityRange: 0.5,
  },

  devops: {
    /** Points awarded when a sprint closes. */
    perSprint: 1,
    /** Points awarded per level gained. */
    perLevel: 1,
  },

  meta: {
    /** XP for the first level; each level costs `growth` times the previous. */
    xpForLevel2: 200,
    levelGrowth: 1.35,
    /** Commits banked per commit made. */
    commitBankRatio: 1,
  },

  score: {
    perCommit: 1,
    perBotFired: 10,
    perSprintCompleted: 5,
  },

  map: {
    /** Chance in percent of a feature branch forking at an eligible depth. */
    forkPct: 55,
    featureBranchLength: { min: 3, max: 4 },
    /** Chance in percent that a feature branch carries a sub-branch. */
    subBranchPct: 30,
    /** Chance in percent of a one-node detour beside a main-line node. */
    detourPct: 45,
    detourWeights: { refactor: 35, risky: 30, chore: 35 },
    /** Depth from which forks may start, and how much room a fork needs. */
    firstForkDepth: 1,
    tailReserve: 6,
  },
} as const;

export type Balance = typeof BALANCE;
