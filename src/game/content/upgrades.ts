import type { PartialEffects } from "@/game/content/effects";

/**
 * The shop. Everything here is paid in money, costs no turn, and is the
 * management half of the game: servers so the product can grow, marketing
 * so it pays more, tooling so the work itself goes better.
 *
 * Some of it is a subscription. `upkeep` is charged per level at the end of
 * every month, which is what keeps the money from being a score that only
 * goes up: a run that buys everything is a run that cannot pay for it.
 */

export const UPGRADE_CATEGORIES = ["infra", "growth", "tooling"] as const;

export type UpgradeCategory = (typeof UPGRADE_CATEGORIES)[number];

export const UPGRADE_IDS = [
  "servers",
  "autoscaling",
  "marketing",
  "premium_plan",
  "ai_subscription",
  "ide_licence",
  "coffee_machine",
  "dev_tooling",
  "ai_supervisor",
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface UpgradeDef {
  id: UpgradeId;
  category: UpgradeCategory;
  maxLevel: number;
  /** Money needed to buy the next level, indexed from level 0. */
  cost: readonly number[];
  /** Charged per level at the end of every month. */
  upkeep: number;
  /** Effects of *one* level. Levels stack by summing. */
  perLevel: PartialEffects;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  servers: {
    id: "servers",
    category: "infra",
    maxLevel: 8,
    cost: [40, 60, 90, 130, 180, 240, 320, 420],
    upkeep: 5,
    perLevel: { infraCapacity: 3 },
  },
  autoscaling: {
    id: "autoscaling",
    category: "infra",
    maxLevel: 2,
    cost: [150, 300],
    upkeep: 15,
    perLevel: { infraCapacity: 6 },
  },

  marketing: {
    id: "marketing",
    category: "growth",
    maxLevel: 3,
    cost: [50, 90, 150],
    upkeep: 6,
    perLevel: { mrrBonusPct: 15 },
  },
  premium_plan: {
    id: "premium_plan",
    category: "growth",
    maxLevel: 1,
    cost: [200],
    upkeep: 0,
    perLevel: { mrrBonusPct: 25 },
  },

  ai_subscription: {
    id: "ai_subscription",
    category: "tooling",
    maxLevel: 2,
    cost: [40, 80],
    upkeep: 6,
    perLevel: { aiSuccessPoints: 4 },
  },
  ide_licence: {
    id: "ide_licence",
    category: "tooling",
    maxLevel: 1,
    cost: [60],
    upkeep: 0,
    perLevel: { craftSuccessPoints: 5 },
  },
  coffee_machine: {
    id: "coffee_machine",
    category: "tooling",
    maxLevel: 1,
    cost: [70],
    upkeep: 0,
    perLevel: { energyMaxBonus: 3 },
  },
  dev_tooling: {
    id: "dev_tooling",
    category: "tooling",
    maxLevel: 2,
    cost: [80, 140],
    upkeep: 4,
    perLevel: { devSpeedBonus: 1 },
  },
  ai_supervisor: {
    id: "ai_supervisor",
    category: "tooling",
    maxLevel: 1,
    cost: [120],
    upkeep: 8,
    perLevel: { autopilot: true },
  },
};

export function isUpgradeId(value: string): value is UpgradeId {
  return Object.hasOwn(UPGRADES, value);
}

/** Money needed to go from `level` to `level + 1`, or undefined when maxed. */
export function upgradeCost(id: UpgradeId, level: number): number | undefined {
  const def = UPGRADES[id];
  if (level >= def.maxLevel) return undefined;
  return def.cost[level];
}

/** The upgrades of one category, in table order, so every screen lists them alike. */
export function upgradesIn(category: UpgradeCategory): UpgradeId[] {
  return UPGRADE_IDS.filter((id) => UPGRADES[id].category === category);
}
