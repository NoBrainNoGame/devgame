import type { PartialEffects } from "@/game/content/effects";

/**
 * The automation tree. Placing a point is free in time, but points are scarce:
 * one per sprint survived and one per level gained.
 *
 * The tension the design asks for: build it early and the work piles up while
 * you tinker; build it late and the debt has already exploded.
 */

export const DEVOPS_IDS = [
  "ci",
  "cd",
  "auto_linter",
  "dependabot",
  "auto_rebase",
  "review_bot",
  "monitoring",
] as const;

export type DevopsId = (typeof DEVOPS_IDS)[number];

export interface DevopsDef {
  id: DevopsId;
  maxLevel: number;
  /** Effects of *one* level. Levels stack by summing. */
  perLevel: PartialEffects;
  /** Points needed to buy the next level, indexed from level 0. */
  cost: readonly number[];
}

export const DEVOPS: Record<DevopsId, DevopsDef> = {
  ci: {
    id: "ci",
    maxLevel: 3,
    perLevel: { allSuccessPoints: 5 },
    cost: [1, 2, 3],
  },
  cd: {
    id: "cd",
    maxLevel: 1,
    // See `ci_cd`: merges are mandatory now, so they pay back more rather than
    // costing nothing.
    perLevel: { mergeRegenBonus: 2 },
    cost: [2],
  },
  auto_linter: {
    id: "auto_linter",
    maxLevel: 1,
    perLevel: { debtVisible: true, debtDecayPerTurn: 1 },
    cost: [2],
  },
  dependabot: {
    id: "dependabot",
    maxLevel: 1,
    perLevel: { cancelObsoleteLib: true },
    cost: [1],
  },
  auto_rebase: {
    id: "auto_rebase",
    maxLevel: 1,
    perLevel: { absorbRebase: true },
    cost: [2],
  },
  review_bot: {
    id: "review_bot",
    maxLevel: 2,
    // Level 1 reviews every 4 turns, level 2 every 3: the second point adds
    // `+1`, and `rules/modifiers` turns the sum into a cadence.
    perLevel: { freeReviewEvery: 1 },
    cost: [2, 3],
  },
  monitoring: {
    id: "monitoring",
    maxLevel: 1,
    perLevel: { monitoring: true },
    cost: [1],
  },
};

export function isDevopsId(value: string): value is DevopsId {
  return Object.hasOwn(DEVOPS, value);
}

/** Points needed to go from `level` to `level + 1`, or undefined when maxed. */
export function devopsCost(id: DevopsId, level: number): number | undefined {
  const def = DEVOPS[id];
  if (level >= def.maxLevel) return undefined;
  return def.cost[level];
}
