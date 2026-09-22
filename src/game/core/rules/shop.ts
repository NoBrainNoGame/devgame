import { UPGRADES, type UpgradeId, upgradeCost } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { syncEnergyMax } from "@/game/core/rules/energy";
import { grantSkillPoints } from "@/game/core/rules/grants";
import { changeMoney } from "@/game/core/rules/money";
import type { RunState } from "@/game/core/types";

/**
 * Buying things. Free in time, like placing a point: the decision the shop
 * asks is never "this or a commit", it is "this or the salary at the end of
 * the month".
 */

export function canBuyUpgrade(state: RunState, id: UpgradeId): boolean {
  const cost = upgradeCost(id, state.upgrades[id] ?? 0);
  return cost !== undefined && cost <= state.money;
}

export function buyUpgrade(context: RuleContext, id: UpgradeId): void {
  const { state } = context;
  const level = state.upgrades[id] ?? 0;
  const cost = upgradeCost(id, level);

  if (cost === undefined) throw new Error(`${id} is already at level ${UPGRADES[id].maxLevel}`);
  if (cost > state.money) throw new Error(`${id} costs ${cost}, you have ${state.money}`);

  changeMoney(context, -cost, "upgrade");
  state.upgrades[id] = level + 1;

  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "upgrade_bought", id, level: level + 1 });
}

/**
 * A skill point bought outright. Each one costs more than the last, so the
 * shop is a shortcut into the tree rather than a replacement for surviving
 * sprints.
 */
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
