import type { PartialEffects } from "@/game/content/effects";
import type { DevRank } from "@/game/content/team";

/**
 * The shop. Everything here is paid in money, costs no turn, and is the
 * management half of the game: what the features you ship buy you.
 *
 * Prices are geometric — `base × growth^level` — and tiered: a rung of the
 * infrastructure ladder, a product, a site each appear at the tier the run
 * reaches, ten times dearer and ten times bigger than the one before. Most
 * rungs have no last level: a run can always buy one more datacenter, and
 * the Death Star has levels too. That is what keeps the game from closing.
 */

export const UPGRADE_CATEGORIES = ["infra", "growth", "tooling", "org"] as const;

export type UpgradeCategory = (typeof UPGRADE_CATEGORIES)[number];

export const UPGRADE_IDS = [
  // The infrastructure ladder: each rung a tier, ten times the capacity.
  "servers",
  "datacenter",
  "region",
  "orbital_station",
  "dyson_swarm",
  "death_star",
  "autoscaling",
  // Growth: percentages, then products that double the revenue outright.
  "marketing",
  "premium_plan",
  "mobile_app",
  "enterprise_plan",
  "platform_api",
  "marketplace",
  "ai_agents",
  // Tooling.
  "ai_subscription",
  "ide_licence",
  "coffee_machine",
  "dev_tooling",
  "ai_supervisor",
  // Organisation: sites that bring seats and a team with them.
  "coworking",
  "office",
  "campus",
  "offshore_hub",
  "orbital_campus",
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface UpgradeDef {
  id: UpgradeId;
  category: UpgradeCategory;
  /** Lowest tier at which it appears in the shop. */
  tier: number;
  /** Price of level n is `round(base × growth ** n)`. */
  price: { base: number; growth: number };
  /** Absent: unbounded. */
  maxLevel?: number;
  /** Charged every month, per level. */
  upkeep: number;
  /** Effects of one level. Levels stack by summing. */
  perLevel: PartialEffects;
  /** A site brings a team with it, hired at no extra fee, paid like any other. */
  hires?: { rank: DevRank; count: number };
}

const rung = (
  id: UpgradeId,
  tier: number,
  base: number,
  growth: number,
  capacity: number,
  upkeep: number,
): UpgradeDef => ({
  id,
  category: "infra",
  tier,
  price: { base, growth },
  upkeep,
  perLevel: { infraCapacity: capacity },
});

// Half the base revenue again, each: additive, so five products make the
// revenue three and a half times, not thirty-two — the tiers already do the
// multiplying.
const product = (id: UpgradeId, tier: number, base: number): UpgradeDef => ({
  id,
  category: "growth",
  tier,
  price: { base, growth: 1 },
  maxLevel: 1,
  upkeep: 0,
  perLevel: { mrrBonusPct: 50 },
});

const site = (
  id: UpgradeId,
  tier: number,
  base: number,
  seats: number,
  hires: { rank: DevRank; count: number },
  rent: number,
): UpgradeDef => ({
  id,
  category: "org",
  tier,
  // One of each: a site is a place, not a stack. The seats that outgrow the
  // ladder come from the companies a run buys.
  price: { base, growth: 1 },
  maxLevel: 1,
  upkeep: rent,
  perLevel: { teamSeats: seats },
  hires,
});

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // Every rung opens at the same price per user; the growth within a rung
  // is what makes the next one, ten times as big, the better buy once the
  // tier allows it.
  servers: rung("servers", 0, 20, 1.15, 100, 2),
  datacenter: rung("datacenter", 1, 200, 1.15, 1_000, 20),
  region: rung("region", 2, 2_000, 1.15, 10_000, 200),
  orbital_station: rung("orbital_station", 3, 20_000, 1.15, 100_000, 2_000),
  dyson_swarm: rung("dyson_swarm", 4, 200_000, 1.15, 1_000_000, 20_000),
  // The last rung is a platform, not a stack: one price, as many as you
  // like, so the servers are never what ends a run that got this far.
  death_star: rung("death_star", 5, 2_000_000, 1, 10_000_000, 200_000),
  autoscaling: {
    id: "autoscaling",
    category: "infra",
    tier: 1,
    price: { base: 2_000, growth: 3 },
    maxLevel: 2,
    upkeep: 100,
    // A percentage of everything you own: the one infra buy that scales.
    perLevel: { infraCapacityPct: 25 },
  },

  marketing: {
    id: "marketing",
    category: "growth",
    tier: 0,
    price: { base: 50, growth: 1.5 },
    maxLevel: 3,
    upkeep: 6,
    perLevel: { mrrBonusPct: 15 },
  },
  premium_plan: {
    id: "premium_plan",
    category: "growth",
    tier: 0,
    price: { base: 200, growth: 1 },
    maxLevel: 1,
    upkeep: 0,
    perLevel: { mrrBonusPct: 25 },
  },
  mobile_app: product("mobile_app", 1, 2_000),
  enterprise_plan: product("enterprise_plan", 2, 20_000),
  platform_api: product("platform_api", 3, 200_000),
  marketplace: product("marketplace", 4, 2_000_000),
  ai_agents: product("ai_agents", 5, 20_000_000),

  ai_subscription: {
    id: "ai_subscription",
    category: "tooling",
    tier: 0,
    price: { base: 40, growth: 2 },
    maxLevel: 2,
    upkeep: 6,
    perLevel: { aiSuccessPoints: 4 },
  },
  ide_licence: {
    id: "ide_licence",
    category: "tooling",
    tier: 0,
    price: { base: 60, growth: 1 },
    maxLevel: 1,
    upkeep: 0,
    perLevel: { craftSuccessPoints: 5 },
  },
  coffee_machine: {
    id: "coffee_machine",
    category: "tooling",
    tier: 0,
    price: { base: 70, growth: 1 },
    maxLevel: 1,
    upkeep: 0,
    perLevel: { energyMaxBonus: 3 },
  },
  dev_tooling: {
    id: "dev_tooling",
    category: "tooling",
    tier: 0,
    price: { base: 80, growth: 1.75 },
    maxLevel: 2,
    upkeep: 4,
    perLevel: { devSpeedBonus: 1 },
  },
  ai_supervisor: {
    id: "ai_supervisor",
    category: "tooling",
    tier: 0,
    // Three levels, ten times dearer each: chooses among your moves, then
    // fixes and refactors on its own, then buys on its own.
    price: { base: 1_000, growth: 10 },
    maxLevel: 3,
    upkeep: 10,
    perLevel: { autopilot: 1 },
  },

  coworking: site("coworking", 1, 1_500, 2, { rank: "junior", count: 1 }, 100),
  office: site("office", 2, 15_000, 4, { rank: "mid", count: 2 }, 1_000),
  campus: site("campus", 3, 150_000, 6, { rank: "mid", count: 3 }, 10_000),
  offshore_hub: site("offshore_hub", 4, 1_500_000, 8, { rank: "senior", count: 4 }, 100_000),
  orbital_campus: site(
    "orbital_campus",
    5,
    15_000_000,
    12,
    { rank: "senior", count: 6 },
    1_000_000,
  ),
};

export function isUpgradeId(value: string): value is UpgradeId {
  return Object.hasOwn(UPGRADES, value);
}

/** Price of the next level, or undefined when there is no next level. */
export function upgradeCost(id: UpgradeId, level: number): number | undefined {
  const def = UPGRADES[id];
  if (def.maxLevel !== undefined && level >= def.maxLevel) return undefined;
  return Math.round(def.price.base * def.price.growth ** level);
}

/** A price with a percentage off, rounded the way every other price is. */
export function discounted(cost: number, pct: number): number {
  return Math.round((cost * (100 - pct)) / 100);
}

export function upgradeUnlocked(id: UpgradeId, tier: number): boolean {
  return UPGRADES[id].tier <= tier;
}

export function upgradesIn(category: UpgradeCategory): UpgradeId[] {
  return UPGRADE_IDS.filter((id) => UPGRADES[id].category === category);
}
