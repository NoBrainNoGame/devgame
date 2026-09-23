import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import type { SystemNote } from "@/game/core/types";

/**
 * The system's own lines. From the third tier the run comments on itself
 * in the log — on a sprint opening, on a tier reached, on what the answers
 * to its questions left behind. Which line is `system.t<tier>.<note>`, in
 * the voice `docs/lore.md` sets for that tier: helpful, then neutral, then
 * addressed to nobody. Nothing here changes a rule; it only says.
 */
export function systemNote(context: RuleContext, note: SystemNote): void {
  const { state } = context;
  if (state.tier < BALANCE.voice.firstTier) return;
  emit(context, { type: "system_note", tier: state.tier, note });
}
