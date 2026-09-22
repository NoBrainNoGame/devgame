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
    /** Energy spent to write a commit, by kind. */
    cost: {
      sprint_start: 0,
      commit: 0,
      refactor: 2,
      risky: 1,
      chore: 1,
      squash: 2,
      docs: 2,
      rebase: 1,
      feature_merge: 2,
      hotfix: 0,
      sprint_merge: 2,
      release: 0,
    } satisfies Record<NodeKind, number>,
    /**
     * Added on top of the node cost, by how you chose to write the commit.
     *
     * The machine's price is flat: whatever the commit is, it costs this and
     * nothing else. That is its whole appeal, and what it makes up for in
     * debt and in what ships broken.
     */
    commitCost: { craft: 2, ai: 1 } satisfies Record<CommitMode, number>,
    reviewCost: 2,
    /**
     * Energy returned by landing a ticket and by a sprint merge.
     *
     * A ticket is four to nine points at up to two energy a commit, so the
     * merge has to give back less than that or energy becomes a resource that
     * only ever goes up.
     */
    featureMergeRegen: 5,
    sprintMergeRegen: 6,
    /**
     * Fraction of the maximum handed back when a sprint closes.
     *
     * Not a full tank. Every ticket ends in a merge, so merge energy is
     * guaranteed rather than earned — and a full refill on top of that made a
     * run that never ends.
     */
    sprintEndRegenRatio: 0.5,
    /** At or below this, every roll takes the crunch malus. */
    crunchThreshold: 4,
    crunchMalusPoints: 15,
    /** Turns finished at zero energy before the run ends in burnout. */
    burnoutStreak: 2,
  },

  commit: {
    /** Base success chance in percent, before any modifier. */
    base: { craft: 92, ai: 74 } satisfies Record<CommitMode, number>,
    /** Replaces the base chance on a `risky` commit. */
    riskyBase: 78,
    /**
     * Replaces the base chance on a `rebase`, which is generous — the whole
     * risk lives in `rebaseDebtDivisor` below.
     */
    rebaseBase: 95,
    /** Success chance is reduced by `debt / debtRiskDivisor` points. */
    debtRiskDivisor: 4,
    /**
     * A rebase is priced by how clean the history is, not by luck: debt bites
     * roughly three times harder here than on an ordinary commit. At zero debt
     * it is nearly free; at sixty it is a coin flip.
     */
    rebaseDebtDivisor: 1.4,
    /** Success is never certain and never hopeless. */
    clamp: { min: 5, max: 95 },
    /** Chance in percent that a craft success makes the next refactor free. */
    craftFreeRefactorPct: 25,
    /** Chance in percent that a success also draws an ambient event. */
    ambientOnSuccessPct: 10,
  },

  /**
   * Story points a successful commit fills on its ticket.
   *
   * The machine fills twice what a hand does. That is the trade the whole game
   * is made of: it is faster, it is cheaper, and everything it writes is debt
   * until somebody reads it.
   */
  points: {
    craft: 1,
    ai: 2,
    /** Added on a `risky` commit, whichever hand wrote it. */
    riskyBonus: 1,
    /** A hotfix or a forced refactor counts one per commit, whoever writes it. */
    mustWrite: 1,
  },

  debt: {
    max: 100,
    /** Debt added by a machine-written commit, on success. */
    perAiCommit: 11,
    perCraftCommit: 0,
    perRiskyNode: 5,
    perAiConflictFix: 10,
    /** Debt repaid by a refactor commit. */
    refactorRepay: 10,
    /** Half-width of the noise added to the displayed range. */
    noiseSpread: 7,
    /** Half-width of the range itself, before the noise. */
    fuzzSpread: 10,
    /** The range is rounded outwards to a multiple of this. */
    fuzzStep: 5,
    /** At or above this, a refactor ticket is forced open. */
    explosionThreshold: 70,
    /** Refactor commits that ticket demands. */
    explosionPoints: 2,
    /** Debt repaid when it merges. */
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
    /** Never erases more than this, whatever the ticket holds. */
    maxCommits: 5,
    /** Unread machine-written commits on the ticket before a squash is offered. */
    minUnread: 2,
  },

  docs: {
    /** Machine-written commits that carry no debt after a documentation commit. */
    charges: 4,
  },

  rebase: {
    /** Debt added when a rebase does not land, from the mess of a half-applied replay. */
    failureDebt: 6,
  },

  failure: {
    /**
     * A merge is where things happen, in git and here. These are the odds
     * that *something* does when a ticket lands — a conflict, a migration, a
     * red CI — a floor, plus what the debt, the unread machine-written work in
     * the ticket and every merge landed on `dev` since it was opened each add.
     * Which thing it is comes from `MERGE_EVENTS`.
     */
    mergeEventBase: 12,
    mergeEventDebtDivisor: 6,
    mergeEventPerUnread: 4,
    mergeEventPerBehind: 8,
    /** However bad it gets, landing a ticket is not a coin flip. */
    mergeEventMax: 55,
    /** Energy lost resolving a merge conflict by hand. */
    conflictManualEnergy: 3,
    /** Base chance in percent of resolving a conflict by hand. */
    conflictManualBase: 75,
    /** Chance in percent that an AI conflict fix plants a hidden bug. */
    conflictAiHiddenBugPct: 30,
    /** Commits a hotfix ticket demands, and how many with monitoring. */
    hotfixPoints: 3,
    hotfixPointsWithMonitoring: 2,
    /** Story points a rejected pull request takes back off the ticket. */
    prRejectedPoints: 1,
    /** Energy lost to a build that breaks for nothing. */
    brokenBuildEnergy: 1,
  },

  /**
   * Work in progress. Every ticket open beyond the first makes each commit
   * dearer and each roll worse — the cost of holding several things in your
   * head, and the pressure a backlog that keeps assigning you work applies.
   */
  wip: {
    /** Added to the energy multiplier per extra open ticket. */
    energyPerExtra: 0.35,
    /** Points taken off every roll per extra open ticket. */
    malusPerExtra: 10,
  },

  sprint: {
    /** Turns in the box. The release ships when they run out. */
    turns: 12,
  },

  tickets: {
    /** Tickets arriving at sprint 1, and one more every `growEvery` sprints. */
    base: 2,
    growEvery: 3,
    maxPerSprint: 4,
    /** Sprints a ticket may sit in the backlog before the board assigns it. */
    graceSprints: 1,
    /** Chance in percent that a ticket carries a skill, beyond the guaranteed one. */
    skillPct: 40,
    /** Story points of a ticket that grants nothing. */
    points: { min: 4, max: 6 },
    /**
     * Extra points a ticket carries when it also grants a skill.
     *
     * The whole trade. A skill has to cost turns, or the ticket that grants
     * one is strictly better than the one beside it and there is no decision.
     */
    skillExtraPoints: { min: 2, max: 3 },
    criteriaCount: { min: 0, max: 2 },
    criteriaWeights: { reviewed: 30, documented: 30, refactored: 25, clean: 15 },
  },

  criteria: {
    /** `clean`: the debt the ticket may merge under. */
    cleanDebtMax: 30,
  },

  /**
   * Production's patience. Incidents fill it, clean sprints drain it, and a
   * full gauge is the sack — the run's other ending.
   */
  quality: {
    max: 100,
    perIncident: 25,
    decayPerCleanSprint: 20,
  },

  release: {
    /** Chance in percent that each unread machine-written commit shipped breaks. */
    bugPerUnreadPct: 12,
  },

  xp: {
    /** XP per story point delivered, multiplied by the sprint it landed in. */
    perPoint: 10,
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
    perTicketPoint: 2,
    perSprintCompleted: 5,
  },
} as const;

export type Balance = typeof BALANCE;
