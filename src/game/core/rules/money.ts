import { emit, type RuleContext } from "@/game/core/rules/context";

/**
 * The one way money moves. It clamps at zero: a run does not go into debt,
 * it goes without — an unpaid subscription simply stops being paid for by
 * the next payday, and an unpaid developer leaves.
 */
export function changeMoney(context: RuleContext, delta: number, reason: string): void {
  if (delta === 0) return;
  const { state } = context;
  const before = state.money;
  state.money = Math.max(0, before + delta);
  const applied = state.money - before;
  if (applied === 0) return;
  emit(context, { type: "money", delta: applied, value: state.money, reason });
}
