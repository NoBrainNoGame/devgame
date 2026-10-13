import { WORLD_EVENTS, type WorldEventId } from "@/game/content";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt, repayDebt } from "@/game/core/rules/debt";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { shareEnergy } from "@/game/core/rules/energy";
import { adjustShare } from "@/game/core/rules/market";
import { changeMoney } from "@/game/core/rules/money";
import { lowerQuality, raiseQuality } from "@/game/core/rules/quality";

/**
 * Something that happens to every company of a world at once, applied through
 * the channels the narrative events already use. It draws nothing: the world
 * decided whether and which, and sent the answer with the round.
 */
export function applyWorldEvent(context: RuleContext, id: WorldEventId): void {
  const { state } = context;
  const effect = WORLD_EVENTS[id];
  emit(context, { type: "world_event", eventId: id });

  if (effect.energy !== undefined) shareEnergy(context, effect.energy, "world");
  if (effect.moneyPct !== undefined) {
    // The money in the bank, never more than it holds: a bad week cannot bankrupt on its own.
    const delta = Math.round((state.money * effect.moneyPct) / 100);
    if (delta !== 0) changeMoney(context, delta, "event");
  }
  if (effect.debt !== undefined) {
    if (effect.debt >= 0) addDebt(context, effect.debt);
    else repayDebt(context, -effect.debt);
  }
  if (effect.quality !== undefined) {
    if (effect.quality >= 0) raiseQuality(context, effect.quality, "event");
    else lowerQuality(context, -effect.quality, "event");
  }
  if (effect.share !== undefined) {
    adjustShare(context, effect.share, mrrOf(state, context.effects), loadOf(state));
  }
}
