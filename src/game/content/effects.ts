/**
 * Every skill, relic, DevOps level and starter profile says what it does by
 * filling in part of this record. `rules/modifiers.ts` sums them all into one
 * `Effects` and is the only place that reads it.
 *
 * A flat additive record rather than a union of effect kinds: composition is
 * then a sum and a logical OR, which cannot be got wrong, and a test can assert
 * that no content entry mentions a field that does not exist here.
 *
 * Percentage-point fields are added to a success chance expressed in percent.
 * Positive is always better for the player.
 */
export interface Effects {
  /** Added to a craft commit's success chance. */
  craftSuccessPoints: number;
  /** Added to an AI commit's success chance. */
  aiSuccessPoints: number;
  /** Added to a risky commit's success chance. */
  riskySuccessPoints: number;
  /** Added to every success chance, on top of the per-kind fields. */
  allSuccessPoints: number;
  /** Added to the chance of resolving a merge conflict by hand. */
  conflictResistancePoints: number;

  /** Raises the energy ceiling. */
  energyMaxBonus: number;
  /** Added to the energy given back by a merge. */
  mergeRegenBonus: number;
  /** Subtracted from the energy cost of a review. */
  reviewEnergyDiscount: number;

  /** Extra commits a single review cleans up. */
  reviewExtraCommits: number;
  /** Debt a machine-written commit does not add. */
  aiDebtDiscount: number;

  /** Show the exact debt instead of a range. */
  debtVisible: boolean;
  /** Widens the displayed debt range. The Vibe Coder flies blind. */
  debtFuzzBonus: number;
  /** Debt repaid automatically at the end of every turn. */
  debtDecayPerTurn: number;

  /** A failed roll may be rolled again, once per sprint. */
  rerollFailedRoll: boolean;
  /** A rejected pull request costs no story points. */
  counterPrRejection: boolean;
  /** A rebase that misses adds no debt. */
  absorbRebase: boolean;
  /** The "obsolete dependency" event never fires. */
  cancelObsoleteLib: boolean;
  /** Warned once ahead of a production bug; hotfix tickets are shorter. */
  monitoring: boolean;
  /** A free review happens automatically every N turns. 0 disables it. */
  freeReviewEvery: number;

  /** Users production can serve before the servers saturate. */
  infraCapacity: number;
  /** Percent added to the whole capacity: what scales with the servers you own. */
  infraCapacityPct: number;
  /** Percent added to the monthly recurring revenue. */
  mrrBonusPct: number;
  /** Seats for developers, on top of the head office. */
  teamSeats: number;
  /** Story points a hired developer fills per turn, on top of the base rate. */
  devSpeedBonus: number;
  /** Tickets every hired developer can hold at once, on top of their rank. */
  devCapacityBonus: number;
  /** Percent taken off a hiring fee. */
  hiringDiscountPct: number;
  /** Percentage points added to the chance that an arriving ticket carries a skill. */
  skillTicketPoints: number;
  /**
   * How fast the idle clock may run: 0 = ×1 only, 1 = ×10, 2 = ×100. Read by
   * the HUD like `autopilot`, bought in the run like everything else.
   */
  idleSpeedTier: number;
  /**
   * The idle timer plays a sensible move instead of resting, and how far it
   * goes: 1 chooses among your moves, 2 also fixes and refactors, 3 also
   * buys. A rendering concern read by the HUD, but bought in the run, so it
   * is an effect.
   */
  autopilot: number;
  /**
   * Unlocks the review action.
   *
   * Reading back what the machine wrote is a thing you learn to do, not a
   * button the game hands you: without it, an AI commit's debt is permanent
   * and the only answers are craft commits, refactor detours and automation.
   * That is what makes the first ticket offering it worth taking.
   */
  canReview: boolean;
  /** Added to production's patience ceiling: how much more it takes to be fired. */
  qualityMaxBonus: number;
}

export const NO_EFFECTS: Effects = {
  craftSuccessPoints: 0,
  aiSuccessPoints: 0,
  riskySuccessPoints: 0,
  allSuccessPoints: 0,
  conflictResistancePoints: 0,

  energyMaxBonus: 0,
  mergeRegenBonus: 0,
  reviewEnergyDiscount: 0,

  reviewExtraCommits: 0,
  aiDebtDiscount: 0,

  debtVisible: false,
  debtFuzzBonus: 0,
  debtDecayPerTurn: 0,

  rerollFailedRoll: false,
  counterPrRejection: false,
  absorbRebase: false,
  cancelObsoleteLib: false,
  monitoring: false,
  freeReviewEvery: 0,
  infraCapacity: 0,
  infraCapacityPct: 0,
  mrrBonusPct: 0,
  teamSeats: 0,
  devSpeedBonus: 0,
  devCapacityBonus: 0,
  hiringDiscountPct: 0,
  skillTicketPoints: 0,
  idleSpeedTier: 0,
  autopilot: 0,
  canReview: true,
  qualityMaxBonus: 0,
};

export const EFFECT_KEYS = Object.keys(NO_EFFECTS).sort() as (keyof Effects)[];

export type PartialEffects = Partial<Effects>;

/** Adds `extra` into `into`, in place. Booleans OR, numbers sum. */
export function addEffects(into: Effects, extra: PartialEffects): Effects {
  for (const key of EFFECT_KEYS) {
    const value = extra[key];
    if (value === undefined) continue;

    if (typeof value === "boolean") {
      // `freeReviewEvery` aside, the boolean fields are pure switches.
      (into[key] as boolean) = (into[key] as boolean) || value;
    } else {
      (into[key] as number) = (into[key] as number) + value;
    }
  }
  return into;
}
