import { emit, type RuleContext } from "@/game/core/rules/context";
import { computeScore } from "@/game/core/score";
import type { GameOverReason, QualitySource } from "@/game/core/types";

/**
 * Ends the run. Idempotent: the first reason to end it is the one that
 * counts. A firing carries what filled the gauge last, so the screen can say
 * which of the five things it was rather than blaming bugs every time.
 *
 * A showcase run has no ending: the gauges fill and nothing follows, which
 * is the one rule the landing page's run plays by that a player's does not.
 */
export function gameOver(
  context: RuleContext,
  reason: GameOverReason,
  cause?: QualitySource,
): void {
  const { state } = context;
  if (state.phase.kind === "game_over" || state.showcase !== null) return;

  const score = computeScore(state);
  state.phase = { kind: "game_over", reason, ...(cause === undefined ? {} : { cause }) };
  emit(context, { type: "game_over", reason, ...(cause === undefined ? {} : { cause }), score });
}

export function isOver(context: RuleContext): boolean {
  return context.state.phase.kind === "game_over";
}
