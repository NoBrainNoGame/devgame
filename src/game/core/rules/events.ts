import {
  AMBIENT_EVENT_IDS,
  AMBIENT_EVENTS,
  type AmbientEventId,
  MERGE_EVENT_IDS,
  MERGE_EVENTS,
  type MergeEventDef,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { conflictChance } from "@/game/core/rules/modifiers";
import { maybeNarrative } from "@/game/core/rules/narrative";
import { raiseQuality } from "@/game/core/rules/quality";
import { forceTicket } from "@/game/core/rules/tickets";
import type { IncidentSource, NodeId } from "@/game/core/types";

/**
 * What happened as the ticket landed. Drawn once `performMerge` has decided
 * something did; the effect is applied here, the outcome is the caller's.
 */
export function drawMergeEvent(context: RuleContext): MergeEventDef {
  const entries = MERGE_EVENT_IDS.filter(
    (id) => !(MERGE_EVENTS[id].cancelledByDependabot && context.effects.cancelObsoleteLib),
  ).map((id) => ({ value: id, weight: MERGE_EVENTS[id].weight }));

  const def = MERGE_EVENTS[context.rng.weighted(entries)];
  emit(context, { type: "merge_event", eventId: def.id });

  if (def.effect.energy !== undefined) {
    if (def.effect.energy >= 0) gainEnergy(context, def.effect.energy, def.id);
    else spendEnergy(context, -def.effect.energy, def.id);
  }
  if (def.effect.debt !== undefined) addDebt(context, def.effect.debt);

  return def;
}

/**
 * The two ways out of a merge conflict, and neither is free.
 *
 * By hand costs energy and can still fail, which is what makes conflict
 * resistance worth building. By machine always works, and quietly adds debt —
 * sometimes with a bug attached, which the release will find.
 */
export function resolveConflict(
  context: RuleContext,
  how: "manual" | "ai",
): { resolved: boolean; hiddenBug: boolean } {
  if (how === "manual") {
    spendEnergy(context, BALANCE.failure.conflictManualEnergy, "conflict_manual");

    const chance = conflictChance(context.state, context.effects);
    const outcome = context.rng.roll(chance.value);

    emit(context, {
      type: "roll",
      action: "conflict",
      chancePct: chance.value,
      rolled: outcome.rolled,
      success: outcome.success,
    });
    emit(context, { type: "conflict_resolved", how, hiddenBug: false });

    return { resolved: outcome.success, hiddenBug: false };
  }

  addDebt(context, BALANCE.debt.perAiConflictFix);
  const hiddenBug = context.rng.chance(BALANCE.failure.conflictAiHiddenBugPct);
  emit(context, { type: "conflict_resolved", how, hiddenBug });

  return { resolved: true, hiddenBug };
}

/**
 * Production broke. The gauge fills, a hotfix ticket opens on your board, and
 * a full gauge is the end of the run.
 *
 * Returns false when monitoring absorbed it: the first bug of a run is a
 * warning, the next gets through.
 */
export function recordIncident(
  context: RuleContext,
  source: IncidentSource,
  nodeId: NodeId,
): boolean {
  const { state } = context;

  if (source === "release" && context.effects.monitoring && !state.monitoringWarning) {
    state.monitoringWarning = true;
    emit(context, { type: "monitoring_warning" });
    return false;
  }

  const points = context.effects.monitoring
    ? BALANCE.failure.hotfixPointsWithMonitoring
    : BALANCE.failure.hotfixPoints;
  const ticket = forceTicket(context, "hotfix", points);
  state.monitoringWarning = false;

  state.sprintIncidents += 1;
  state.stats.incidents += 1;
  emit(context, { type: "incident", source, nodeId, ticketId: ticket.id });
  raiseQuality(context, BALANCE.quality.perIncident, "incident");
  if (state.phase.kind === "choose_action") maybeNarrative(context, "incident");
  return true;
}

/** The small weather of a working week. */
export function drawAmbient(context: RuleContext): AmbientEventId | null {
  const entries = AMBIENT_EVENT_IDS.filter(
    (id) => !(AMBIENT_EVENTS[id].cancelledByDependabot && context.effects.cancelObsoleteLib),
  ).map((id) => ({ value: id, weight: AMBIENT_EVENTS[id].weight }));

  if (entries.length === 0) return null;

  const eventId = context.rng.weighted(entries);
  const { effect } = AMBIENT_EVENTS[eventId];

  emit(context, { type: "ambient_event", eventId });

  if (effect.energy !== undefined) {
    if (effect.energy >= 0) gainEnergy(context, effect.energy, eventId);
    else spendEnergy(context, -effect.energy, eventId);
  }
  if (effect.debt !== undefined) addDebt(context, effect.debt);

  return eventId;
}
