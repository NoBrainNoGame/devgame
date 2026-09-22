import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { gameOver } from "@/game/core/rules/over";

/**
 * Production's patience. It fills on incidents and on the backlog you let
 * rot, empties a little on every clean sprint, and full is the sack — the
 * ending that says the work got away from you, as opposed to burnout, which
 * says you got away from yourself.
 */
export function raiseQuality(context: RuleContext, amount: number): void {
  const { state } = context;
  const before = state.quality;
  state.quality = Math.min(BALANCE.quality.max, before + amount);
  if (state.quality === before) return;

  emit(context, { type: "quality", delta: state.quality - before, value: state.quality });
  if (state.quality >= BALANCE.quality.max) gameOver(context, "fired");
}
