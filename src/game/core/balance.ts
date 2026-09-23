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
      fix: 2,
      risky: 1,
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
    /**
     * Energy a turn spent resting gives back, minus one per open ticket beyond
     * the first: a crowded board is one you cannot rest on.
     */
    restRegen: 5,
  },

  commit: {
    /** Base success chance in percent, before any modifier. */
    base: { craft: 92, ai: 72 } satisfies Record<CommitMode, number>,
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
    ai: 3,
    /** Added on a `risky` commit, whichever hand wrote it. */
    riskyBonus: 1,
    /** A hotfix or a forced refactor counts one per commit, whoever writes it. */
    mustWrite: 1,
  },

  debt: {
    max: 100,
    /** Debt added by a machine-written commit, on success. */
    perAiCommit: 10,
    perCraftCommit: 0,
    perRiskyNode: 5,
    perAiConflictFix: 10,
    /**
     * Debt repaid by a refactor commit on a *forced* refactor ticket, which has
     * no indebted commit of its own to redo. An offered refactor repays exactly
     * what its target commit cost.
     */
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
    cleans: 2,
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
    energyPerExtra: 0.25,
    /**
     * Percent of the roll lost per open ticket beyond the first. Relative, so
     * the gap between the two hands stays what the base rates say it is.
     * Hotfix tickets do not count: the forced ticket is the punishment.
     */
    malusPctPerExtra: 12,
  },

  sprint: {
    /** Turns in the box. The release ships when they run out. */
    turns: 12,
    /** Relics on offer when a sprint closes, and one more for an objective met. */
    relicOffer: 3,
  },

  /** The tier from which the system speaks in the log, and the interface changes its words. */
  voice: { firstTier: 3 },

  /** What a sprint asks. Money in tier-0 euros, scaled by the tier. */
  objectives: {
    moneyReward: 60,
    /** The debt a sprint must close under, for that objective. */
    debtUnder: 30,
    /** Share of the sprint's arrivals to land yourself, for that objective. */
    deliverSharePct: 50,
  },

  tickets: {
    /** Tickets arriving at sprint 1, and one more every `growEvery` sprints. */
    base: 2,
    growEvery: 4,
    maxPerSprint: 8,
    /** More tickets per sprint for every tier reached, on top of the cap. */
    perTier: 2,
    /** Sprints a ticket may sit in the backlog before the board assigns it. */
    graceSprints: 1,
    /**
     * Chance in percent that a ticket carries a skill, beyond the guaranteed
     * one. Low on purpose: a skill ticket is rare, expires unstarted at the
     * end of its sprint, and the Product owner node is how you see more.
     */
    skillPct: 25,
    /** Story points of a ticket that grants nothing. */
    points: { min: 5, max: 7 },
    /**
     * The kinds of work, past the first ticket of a sprint, which is always
     * a feature. One weighted draw per ticket, by tier band; the debt ticket
     * is not drawn but arrives on its own when the debt says so.
     */
    kinds: {
      weights: [
        { feature: 80, client_bug: 10, vip: 4, migration: 6 },
        { feature: 70, client_bug: 15, vip: 7, migration: 8 },
        { feature: 60, client_bug: 18, vip: 10, migration: 12 },
        { feature: 50, client_bug: 20, vip: 15, migration: 15 },
      ],
      /** A customer's bug: small, dated, and production breathes when it goes. */
      clientBug: { points: { min: 2, max: 3 }, patienceOnFix: 10, patienceOnMiss: 10 },
      /** A big customer's feature: bigger, twice the revenue, a bonus if on time. */
      vip: { extraPoints: 2, mrrFactor: 2, bonus: 50 },
      /** The codebase asking for a refactor: arrives at this debt, repays this. */
      debt: { points: 2, threshold: 40, repay: 20 },
      /** A library to leave: every commit costs debt; landing it buys a level of servers. */
      migration: { points: { min: 4, max: 6 }, debtPerCommit: 3, serverLevels: 1 },
    },
    /**
     * Extra points a ticket carries when it also grants a skill.
     *
     * The whole trade. A skill has to cost turns, or the ticket that grants
     * one is strictly better than the one beside it and there is no decision.
     */
    skillExtraPoints: { min: 2, max: 3 },
  },

  /**
   * The pull request review. A ticket with its points full is submitted; the
   * reviewer reads it and either lands it or sends it back with what they
   * found. What they find is what the design punishes: machine-written work
   * nobody read, and a codebase too indebted to take more.
   */
  acceptance: {
    /** Chance in percent that each unread machine-written commit is caught as a bug. */
    bugDetectPct: 55,
    /** Debt above which a review refuses, whatever the code. */
    maxDebt: 45,
    /** Story points added per bug found, for the fixes. */
    pointsPerBug: 1,
  },

  /**
   * Production's patience. Incidents fill it, clean sprints drain it, and a
   * full gauge is the sack — the run's other ending.
   */
  quality: {
    max: 100,
    perIncident: 25,
    /** Production's patience lost for every backlog ticket the sprint had to force on you. */
    perStaleTicket: 10,
    /** Patience lost when a review sends a pull request back. */
    perRejection: 15,
    /**
     * Patience lost when you landed nothing yourself all sprint. A hired team
     * can clear the board without you; production still expects to see you.
     */
    perIdleSprint: 15,
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

  /** The skill tree's currency. */
  tree: {
    /** Points awarded when a sprint closes. */
    perSprint: 1,
    /**
     * Points a run starts with per account level above the first. The
     * account's levels used to buy permanent stats; now they buy a head start
     * in the same tree everything else is placed in.
     */
    perAccountLevel: 1,
  },

  /** The management game: revenue, servers, the shop. */
  economy: {
    /** Paydays per sprint. `sprint.turns` must divide by it. */
    monthsPerSprint: 3,
    startingMoney: 100,
    /** Monthly revenue of a shipped feature: this per story point, plus a jitter. */
    mrrPerPoint: 3,
    mrrJitter: { min: 0, max: 3 },
    /**
     * Orders of magnitude. A tier is reached at `first × growth^(tier−1)` of
     * lifetime earnings — never of money in hand, so a purchase cannot shrink
     * the next ticket and saving is never the way up. Every feature that
     * arrives at a tier earns and weighs `mrrGrowth`/`loadGrowth` to that
     * power, so the unit of account changes with the run and yesterday's
     * features become rounding noise, the way an incremental game is meant
     * to feel.
     */
    tier: {
      first: 1_000,
      growth: 10,
      /**
       * Five, not ten: the team and the products compound with it, and a
       * tier is meant to last a couple of sprints all the way up, not a
       * month by the end. The money still climbs a decade a tier — that is
       * what the thresholds say — it just takes more features to do it.
       */
      mrrGrowth: 5,
      loadGrowth: 5,
      /**
       * Past this tier a feature brings no more users than at it: there are
       * only so many people, and the last rung of the ladder is meant to be
       * enough for all of them. Revenue keeps climbing; the servers stop
       * being the thing that ends a run.
       */
      loadTierCap: 5,
      /**
       * The last tier. Products, sites and a growing team compound with the
       * tier's own ×10, so past here a tier would last a month; the ladder
       * ends where the lore does, and the money keeps counting without it.
       */
      last: 6,
    },
    infra: {
      /** Users production serves before anything has been bought. */
      baseCapacity: 300,
      /** Users a story point of a tier-0 feature brings. */
      usersPerPoint: 10,
      /**
       * Patience lost every month per ten percent over capacity. A quarter
       * over is a slow bleed a clean sprint outpaces; twice over is the end
       * of the run in a sprint or two. Relative, so it means the same thing
       * at every order of magnitude.
       */
      outageQualityPer10Pct: 2,
      /**
       * Overrun production puts up with before its patience goes: under
       * this, a saturated month costs revenue and nothing else. A tier's
       * first feature always lands before the tier's capacity is paid for.
       */
      outageTolerancePct: 25,
      /** Overrun beyond this counts no further: the bleed has a ceiling. */
      outageMaxPct: 100,
      /** Share of capacity at which the board is warned. */
      warnPct: 80,
      /** An open ticket this full counts towards the next payday's load. */
      predictFillPct: 75,
    },
    /** Months of finance history kept for the chart. */
    historyMonths: 60,
    /** A skill point bought outright: this, times `growth` per point already bought. */
    skillPoint: { price: 60, growth: 1.5 },
  },

  /**
   * The market. The run's power is its revenue plus its users; its share is
   * that against every competitor alive, and the share sets a multiplier on
   * the revenue: a corner of the market pays sixty percent, all of it a
   * hundred and forty. Competitors enter at their tier, grow by their own
   * aggression plus a jitter, and merge when one of them dominates.
   */
  market: {
    /** Users per unit of power: ten users weigh as much as one euro of revenue. */
    usersPerPower: 10,
    /** Revenue multiplier at no share, and at all of it. */
    multiplier: { min: 0.6, max: 1.4 },
    priceWar: { penalty: 0.15, months: 3 },
    /** Half-width of the monthly jitter on a competitor's growth, in percent. */
    jitterPct: 3,
    /** A merger is rolled each month once one competitor holds this much of them. */
    merge: { dominancePct: 70, chancePct: 20 },
    /** Share points a customer's bug fixed, and a VIP on time, earn; a VIP late loses. */
    clientBugShare: 1,
    vipShare: 2,
  },

  /**
   * The events that ask the company something. A chance per trigger, rolled
   * every time the trigger fires whether or not an event may open; a
   * cooldown so the questions stay rare.
   */
  narrative: {
    cooldownTurns: 6,
    chance: { sprint_start: 60, payday: 25, incident: 40, tier_up: 100 },
  },

  /**
   * Hacking the outside world: a coin flip, offered once a sprint and only
   * in a very tight spot — production's patience nearly gone, no energy
   * under a pile of tickets, or servers saturated with no rung affordable.
   * Winning buys the thing that was missing; losing, with the patience
   * gone, is the end of the run, and otherwise an incident.
   */
  hack: {
    chancePct: 50,
    /** Patience bought back on a win of the `patience` kind. */
    patienceRelief: 40,
    /** Share of production's patience past which the offer appears. */
    offerAtQualityPct: 85,
    /** Extra tickets in hand, with no energy, past which the offer appears. */
    offerAtWipExtra: 2,
  },

  /** The hired team. Ranks are priced in `content/team.ts`. */
  team: {
    /** Seats at the head office; sites add theirs. */
    baseSeats: 3,
    /** Tickets delivered before a developer is promoted a rank. */
    promoteEvery: 4,
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
