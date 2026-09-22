/**
 * What a ticket may demand before it merges, beyond its story points.
 *
 * Each criterion is satisfied by something the player can already do — write a
 * documentation commit, refactor, review, keep the debt down — so a ticket is
 * never a new mechanic, only a reason to use one. `rules/criteria.ts` says
 * exactly when each holds; the weights that decide how often a ticket asks for
 * one live in `balance.ts`.
 */

export const CRITERION_KINDS = ["reviewed", "documented", "refactored", "clean"] as const;

export type CriterionKind = (typeof CRITERION_KINDS)[number];

export function isCriterionKind(value: string): value is CriterionKind {
  return (CRITERION_KINDS as readonly string[]).includes(value);
}
