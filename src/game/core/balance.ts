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
 * `RULES_FINGERPRINT` in `src/game/dto/version.ts` hashes this module. An old
 * save then loads read-only instead of scoring wrong. (`SAVE_VERSION` is a
 * different number, bumped by hand when the *shape* of a save changes.)
 */
export const BALANCE = {
  energy: {
    base: 22,
    /** Energy spent to resolve a node, by kind. */
    cost: {
      sprint_start: 0,
      commit: 0,
      refactor: 2,
      risky: 1,
      chore: 1,
      squash: 2,
      docs: 2,
      rebase: 1,
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
    /**
     * Energy returned by merging a feature branch and by a sprint merge.
     *
     * A feature is two to five commits at two energy each, so the merge has to
     * give back less than that or the trunk-based shape turns energy into a
     * resource that only ever goes up.
     *
     * Raised by two when a skill started costing commits: the branch a player
     * actually picks grew by about one commit, and the rest went on paying for
     * it out of a budget that had not moved.
     */
    featureMergeRegen: 4,
    sprintMergeRegen: 6,
    /**
     * Fraction of the maximum handed back when a sprint closes.
     *
     * Not a full tank. Every feature now ends in a merge, so merge energy is
     * guaranteed rather than earned by choosing to branch — and a full refill
     * on top of that made a run that never ends.
     */
    sprintEndRegenRatio: 0.5,
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
    base: { craft: 92, ai: 74 } satisfies Record<CommitMode, number>,
    /** Replaces the base chance on a `risky` node. */
    riskyBase: 78,
    /**
     * Replaces the base chance on a `rebase` node, which is generous — the
     * whole risk lives in `rebaseDebtDivisor` below.
     */
    rebaseBase: 95,
    /** Success chance is reduced by `debt / debtRiskDivisor` points. */
    debtRiskDivisor: 4,
    /**
     * A rebase is priced by how clean the history is, not by luck: debt bites
     * roughly three times harder here than on an ordinary commit. At zero debt
     * it is nearly free tempo; at sixty it is a coin flip.
     */
    rebaseDebtDivisor: 1.4,
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
    perAiJumpNode: 2,
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
    /** Automatic review cadence at one point; each further point removes one. */
    botCadence: 4,
  },

  squash: {
    /**
     * Debt erased per machine-written commit the squash swallows. Higher than a
     * review's, because a squash is paid for in score and a review is not.
     */
    repayPerCommit: 7,
    /** Commits the history keeps: the rest are gone, and so is their score. */
    keptCommits: 1,
    /** Never erases more than this, whatever the window holds. */
    maxCommits: 5,
  },

  docs: {
    /**
     * Machine-written commits that carry no debt after a documentation node.
     * A burst is three or four nodes, so this covers about one burst.
     */
    charges: 4,
  },

  rebase: {
    /** Main-line nodes replayed on top of you when the rebase lands. */
    carry: 1,
    /** Debt added when it does not, from the mess of a half-applied replay. */
    failureDebt: 6,
  },

  failure: {
    /**
     * A merge is where conflicts come from, in git and here. These are the
     * odds of one when a branch lands: a floor, plus what the debt and the
     * unread machine-written work in the branch add.
     */
    mergeConflictBase: 12,
    mergeConflictDebtDivisor: 6,
    mergeConflictPerUnread: 4,
    /** However bad it gets, landing a branch is not a coin flip. */
    mergeConflictMax: 55,
    /** Energy lost resolving a merge conflict by hand. */
    conflictManualEnergy: 3,
    /** Base chance in percent of resolving a conflict by hand. */
    conflictManualBase: 75,
    /** Chance in percent that an AI conflict fix plants a hidden bug. */
    conflictAiHiddenBugPct: 30,
    /** Nodes in a hotfix branch, and how many monitoring removes. */
    hotfixNodes: 3,
    hotfixNodesWithMonitoring: 2,
    /** Energy lost reworking a rejected pull request. */
    prRejectedEnergy: 1,
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
    perSprintCompleted: 5,
  },

  map: {
    /** Features delivered into `main` per sprint. One merge each. */
    featuresPerSprint: { min: 3, max: 5 },
    /** Branches offered at each merge. Two is a choice, three is a fork. */
    featureOptions: { min: 2, max: 3 },
    /**
     * Commits inside a feature branch that grants nothing.
     *
     * This is the fast option: you deliver, and you come out of it with
     * nothing lasting.
     */
    featureBranchLength: { min: 2, max: 3 },
    /**
     * Extra commits a branch carries when it also grants a skill.
     *
     * The whole trade. A skill has to cost turns, or the branch that grants one
     * is strictly better than the branch beside it and there is no decision to
     * make.
     */
    skillBranchExtraCommits: { min: 1, max: 2 },
    /** Chance in percent that a feature branch carries a branch of its own. */
    subBranchPct: 25,
    /** Chance in percent of a one-node detour beside a commit inside a feature. */
    detourPct: 35,
    detourWeights: { refactor: 22, risky: 18, chore: 18, squash: 14, docs: 14, rebase: 14 },
  },
} as const;

export type Balance = typeof BALANCE;
