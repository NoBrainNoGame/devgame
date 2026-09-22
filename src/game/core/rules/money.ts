import { emit, type RuleContext } from "@/game/core/rules/context";
import { raiseTier, tierOf } from "@/game/core/rules/tier";

/**
 * Every change of money goes through here. It never goes below zero — what
 * cannot be paid is simply not had — and money going up is one of the two
 * things that can raise the tier.
 */
export function changeMoney(context: RuleContext, delta: number, reason: string): void {
  if (delta === 0) return;
  const { state } = context;
  const before = state.money;
  state.money = Math.max(0, before + delta);
  const applied = state.money - before;
  if (applied === 0) return;
  emit(context, { type: "money", delta: applied, value: state.money, reason });
  if (applied > 0) raiseTier(context, tierOf(state.money));
}
