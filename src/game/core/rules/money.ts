import { emit, type RuleContext } from "@/game/core/rules/context";
import { raiseTier, tierOf } from "@/game/core/rules/tier";

/**
 * Every change of money goes through here. It never goes below zero — what
 * cannot be paid is simply not had — and every euro that comes in counts
 * towards the tier for good: the tier follows what the run has *earned*,
 * not what it holds, so spending never makes it smaller and saving is never
 * the way up. That is the rule every incremental settles on, and for the
 * same reason: a shop that punishes buying is a shop nobody uses.
 */
export function changeMoney(context: RuleContext, delta: number, reason: string): void {
  if (delta === 0) return;
  const { state } = context;
  const before = state.money;
  state.money = Math.max(0, before + delta);
  const applied = state.money - before;
  if (applied === 0) return;
  emit(context, { type: "money", delta: applied, value: state.money, reason });
  if (state.money > state.stats.moneyPeak) state.stats.moneyPeak = state.money;
  if (applied > 0) {
    state.moneyEarned += applied;
    raiseTier(context, tierOf(state.moneyEarned));
  }
}
