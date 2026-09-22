import { emit, type RuleContext } from "@/game/core/rules/context";
import { computeScore } from "@/game/core/score";
import type { GameOverReason } from "@/game/core/types";

/** Ends the run. Idempotent: the first reason to end it is the one that counts. */
export function gameOver(context: RuleContext, reason: GameOverReason): void {
  const { state } = context;
  if (state.phase.kind === "game_over") return;

  const score = computeScore(state);
  state.phase = { kind: "game_over", reason };
  emit(context, { type: "game_over", reason, score });
}

export function isOver(context: RuleContext): boolean {
  return context.state.phase.kind === "game_over";
}
