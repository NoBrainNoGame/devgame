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
  /**
   * Unlocks the review action.
   *
   * Reading back what the machine wrote is a thing you learn to do, not a
   * button the game hands you: without it, an AI commit's debt is permanent
   * and the only answers are craft commits, refactor detours and automation.
   * That is what makes the first ticket offering it worth taking.
   */
  canReview: boolean;
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
  canReview: true,
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
