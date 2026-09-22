import type { PartialEffects } from "@/game/content/effects";

/**
 * The skill tree. Placing a point is free in time, but points are scarce:
 * one per sprint survived, one per account level at the start of a run, and
 * whatever the shop sells you.
 *
 * Four branches. The two automation ones are the DevOps tree the game started
 * with; management is what makes a hired team worth its salary; profile is
 * the three base stats the account used to hold permanently, now placed in
 * the run, so a level is a decision every time rather than a number once.
 *
 * A node may require another at a given level. The tension the design asks
 * for is unchanged: build it early and the work piles up while you tinker;
 * build it late and the debt has already exploded.
 */

export const TREE_BRANCHES = ["cicd", "devops", "management", "profile"] as const;

export type TreeBranch = (typeof TREE_BRANCHES)[number];

export const TREE_IDS = [
  "ci",
  "cd",
  "auto_linter",
  "dependabot",
  "auto_rebase",
  "review_bot",
  "monitoring",
  "sre",
  "agile_coach",
  "recruiter",
  "growth_hacking",
  "mentoring",
  "stamina",
  "luck",
  "calm",
] as const;

export type TreeNodeId = (typeof TREE_IDS)[number];

export interface TreeRequirement {
  id: TreeNodeId;
  level: number;
}

export interface TreeNodeDef {
  id: TreeNodeId;
  branch: TreeBranch;
  maxLevel: number;
  /** Effects of *one* level. Levels stack by summing. */
  perLevel: PartialEffects;
  /** Points needed to buy the next level, indexed from level 0. */
  cost: readonly number[];
  /** Nodes that must be at least this high before the first point goes here. */
  requires?: readonly TreeRequirement[];
}

export const TREE: Record<TreeNodeId, TreeNodeDef> = {
  ci: {
    id: "ci",
    branch: "cicd",
    maxLevel: 3,
    perLevel: { allSuccessPoints: 5 },
    cost: [1, 2, 3],
  },
  cd: {
    id: "cd",
    branch: "cicd",
    maxLevel: 1,
    // See `ci_cd`: merges are mandatory now, so they pay back more rather than
    // costing nothing.
    perLevel: { mergeRegenBonus: 2 },
    cost: [2],
    requires: [{ id: "ci", level: 1 }],
  },
  auto_rebase: {
    id: "auto_rebase",
    branch: "cicd",
    maxLevel: 1,
    perLevel: { absorbRebase: true },
    cost: [2],
    requires: [{ id: "ci", level: 1 }],
  },
  review_bot: {
    id: "review_bot",
    branch: "cicd",
    maxLevel: 2,
    // Level 1 reviews every 4 turns, level 2 every 3: the second point adds
    // `+1`, and `rules/modifiers` turns the sum into a cadence.
    perLevel: { freeReviewEvery: 1 },
    cost: [2, 3],
    requires: [{ id: "ci", level: 2 }],
  },

  monitoring: {
    id: "monitoring",
    branch: "devops",
    maxLevel: 1,
    perLevel: { monitoring: true },
    cost: [1],
  },
  dependabot: {
    id: "dependabot",
    branch: "devops",
    maxLevel: 1,
    perLevel: { cancelObsoleteLib: true },
    cost: [1],
  },
  auto_linter: {
    id: "auto_linter",
    branch: "devops",
    maxLevel: 1,
    perLevel: { debtVisible: true, debtDecayPerTurn: 1 },
    cost: [2],
    requires: [{ id: "monitoring", level: 1 }],
  },
  sre: {
    id: "sre",
    branch: "devops",
    maxLevel: 2,
    // The one automation that touches the economy: capacity without upkeep.
    perLevel: { infraCapacity: 2 },
    cost: [2, 3],
    requires: [{ id: "monitoring", level: 1 }],
  },

  agile_coach: {
    id: "agile_coach",
    branch: "management",
    maxLevel: 2,
    perLevel: { devSpeedBonus: 1 },
    cost: [2, 3],
  },
  recruiter: {
    id: "recruiter",
    branch: "management",
    maxLevel: 1,
    perLevel: { hiringDiscountPct: 30 },
    cost: [1],
  },
  growth_hacking: {
    id: "growth_hacking",
    branch: "management",
    maxLevel: 3,
    perLevel: { mrrBonusPct: 10 },
    cost: [1, 2, 3],
  },
  mentoring: {
    id: "mentoring",
    branch: "management",
    maxLevel: 1,
    perLevel: { devCapacityBonus: 1 },
    cost: [3],
    requires: [{ id: "agile_coach", level: 1 }],
  },

  stamina: {
    id: "stamina",
    branch: "profile",
    maxLevel: 5,
    perLevel: { energyMaxBonus: 2 },
    cost: [1, 1, 2, 2, 3],
  },
  luck: {
    id: "luck",
    branch: "profile",
    maxLevel: 5,
    perLevel: { allSuccessPoints: 2 },
    cost: [1, 1, 2, 2, 3],
  },
  calm: {
    id: "calm",
    branch: "profile",
    maxLevel: 3,
    perLevel: { conflictResistancePoints: 5 },
    cost: [1, 2, 2],
  },
};

export function isTreeNodeId(value: string): value is TreeNodeId {
  return Object.hasOwn(TREE, value);
}

/** Points needed to go from `level` to `level + 1`, or undefined when maxed. */
export function treeCost(id: TreeNodeId, level: number): number | undefined {
  const def = TREE[id];
  if (level >= def.maxLevel) return undefined;
  return def.cost[level];
}

/** The nodes of one branch, in table order, so every screen lists them alike. */
export function treeBranch(branch: TreeBranch): TreeNodeId[] {
  return TREE_IDS.filter((id) => TREE[id].branch === branch);
}
