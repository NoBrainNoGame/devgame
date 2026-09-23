import { UPGRADES, type UpgradeId, upgradeCost, upgradeUnlocked } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
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

export function canBuyUpgrade(state: RunState, id: UpgradeId): boolean {
  if (!upgradeUnlocked(id, state.tier)) return false;
  const cost = upgradeCost(id, state.upgrades[id] ?? 0);
  return cost !== undefined && cost <= state.money;
}

export function buyUpgrade(context: RuleContext, id: UpgradeId): void {
  const { state } = context;
  const def = UPGRADES[id];
  const level = state.upgrades[id] ?? 0;
  const cost = upgradeCost(id, level);

  if (!upgradeUnlocked(id, state.tier)) throw new Error(`${id} unlocks at tier ${def.tier}`);
  if (cost === undefined) throw new Error(`${id} is already at level ${def.maxLevel}`);
  if (cost > state.money) throw new Error(`${id} costs ${cost}, you have ${state.money}`);

  changeMoney(context, -cost, "upgrade");
  state.upgrades[id] = level + 1;

  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "upgrade_bought", id, level: level + 1 });

  if (def.hires !== undefined) {
    for (let i = 0; i < def.hires.count; i += 1) addDev(context, def.hires.rank, { site: id });
  }
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
