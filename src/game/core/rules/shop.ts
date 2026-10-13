import { discounted, UPGRADES, type UpgradeId, upgradeCost, upgradeUnlocked } from "@/game/content";
import { BALANCE, CREW_BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { syncEnergyMax } from "@/game/core/rules/energy";
import { grantSkillPoints } from "@/game/core/rules/grants";
import { changeMoney } from "@/game/core/rules/money";
import { addDev } from "@/game/core/rules/team";
import type { RunState } from "@/game/core/types";

/**
 * Buying. Free in time, paid in money, and gated by the tier: a rung of the
 * ladder the run has not reached is not for sale yet. A site brings its
 * team with it — hired at no extra fee, on the payroll like anyone else.
 */

/** What the next level costs here and now: the list price, less a pending bonus. */
export function upgradePrice(state: RunState, id: UpgradeId): number | undefined {
  const cost = listPrice(state, id);
  return cost === undefined ? undefined : discounted(cost, state.boosts.shopDiscountPct);
}

/**
 * A company may buy a kind of site many times, each dearer than the last,
 * where a solo run has one of each. Every other upgrade is the ladder it is.
 */
function listPrice(state: RunState, id: UpgradeId): number | undefined {
  const level = state.upgrades[id] ?? 0;
  const def = UPGRADES[id];
  if (state.crew === undefined || def.hires === undefined) return upgradeCost(id, level);
  if (level >= CREW_BALANCE.sites.maxPerKind) return undefined;
  return Math.round(def.price.base * CREW_BALANCE.sites.priceGrowth ** level);
}

export function canBuyUpgrade(state: RunState, id: UpgradeId): boolean {
  if (!upgradeUnlocked(id, state.tier)) return false;
  const cost = upgradePrice(state, id);
  return cost !== undefined && cost <= state.money;
}

export function buyUpgrade(context: RuleContext, id: UpgradeId): void {
  const { state } = context;
  const def = UPGRADES[id];
  const level = state.upgrades[id] ?? 0;
  const cost = upgradePrice(state, id);

  if (!upgradeUnlocked(id, state.tier)) throw new Error(`${id} unlocks at tier ${def.tier}`);
  if (cost === undefined) throw new Error(`${id} is already at level ${def.maxLevel}`);
  if (cost > state.money) throw new Error(`${id} costs ${cost}, you have ${state.money}`);

  changeMoney(context, -cost, "upgrade");
  state.upgrades[id] = level + 1;
  const siteId = state.crew === undefined ? undefined : openSite(state, id, level + 1);
  state.boosts.shopDiscountPct = 0;

  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "upgrade_bought", id, level: level + 1 });

  if (def.hires !== undefined) {
    for (let i = 0; i < def.hires.count; i += 1) {
      addDev(context, def.hires.rank, { site: id }, siteId);
    }
  }
}

/** A site bought by a company is a place of its own, with its seats, empty of humans. */
function openSite(state: RunState, id: UpgradeId, n: number): string {
  const crew = state.crew;
  if (crew === undefined) throw new Error("Only a company has sites");
  const siteId = `${id}-${n}`;
  crew.sites[siteId] = { upgrade: id, seats: UPGRADES[id].perLevel.teamSeats ?? 0 };
  return siteId;
}

export function skillPointPrice(state: RunState): number {
  const { price, growth } = BALANCE.economy.skillPoint;
  return Math.round(price * growth ** state.skillPointsBought);
}

export function canBuySkillPoint(state: RunState): boolean {
  return skillPointPrice(state) <= state.money;
}

export function buySkillPoint(context: RuleContext): void {
  const { state } = context;
  const price = skillPointPrice(state);
  if (price > state.money) throw new Error(`A skill point costs ${price}, you have ${state.money}`);

  changeMoney(context, -price, "skill_point");
  state.skillPointsBought += 1;
  emit(context, { type: "skill_point_bought", price });
  grantSkillPoints(context, 1);
}
