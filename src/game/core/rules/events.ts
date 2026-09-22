import {
  AMBIENT_EVENT_IDS,
  AMBIENT_EVENTS,
  type AmbientEventId,
  FAILURE_EVENT_IDS,
  FAILURE_EVENTS,
  type FailureEventId,
  MERGE_EVENT_IDS,
  MERGE_EVENTS,
  type MergeEventDef,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { conflictChance } from "@/game/core/rules/modifiers";
import { raiseQuality } from "@/game/core/rules/quality";
import { hasUnreviewedAi } from "@/game/core/rules/review";
import { currentTicket, forceTicket, isOnHotfix } from "@/game/core/rules/tickets";
import { fillPoints } from "@/game/core/rules/write";
import type { IncidentSource, NodeId, NodeKind } from "@/game/core/types";

/**
 * What a missed roll costs you.
 *
 * Only half of the table actually takes the turn away. A merge conflict hands
 * you a second decision instead, and two of the others are exactly the ones a
 * skill can neutralise — so the answer to "my PRs keep getting rejected" is a
 * build, not luck.
 */

export type FailureOutcome =
  /** Nothing is written and the reducer opens the conflict choice. */
  | { kind: "conflict" }
  /** Something handled it: write the commit as if the roll had passed. */
  | { kind: "resolve" }
  /** The turn is gone; nothing was written. */
  | { kind: "retry" }
  /** It shipped, and it broke production. A hotfix ticket is now open. */
  | { kind: "resolve_then_incident" };

export function resolveFailure(context: RuleContext, kind: NodeKind): FailureOutcome {
  const eventId = drawFailure(context, kind);

  // Monitoring's first half: the bug is spotted before it ships. It costs the
  // turn anyway — you still have to go and fix it — and it only works once,
  // because a permanent immunity to the design's nastiest failure would make
  // one DevOps point worth more than the rest of the tree.
  if (eventId === "prod_bug" && context.effects.monitoring && !context.state.monitoringWarning) {
    context.state.monitoringWarning = true;
    emit(context, { type: "monitoring_warning" });
    return { kind: "retry" };
  }

  emit(context, { type: "failure_event", eventId });

  switch (eventId) {
    case "merge_conflict":
      return { kind: "conflict" };

    case "prod_bug":
      return { kind: "resolve_then_incident" };

    case "pr_rejected": {
      const countered = context.effects.counterPrRejection;
      emit(context, { type: "pr_rejected", countered });
      if (countered) return { kind: "resolve" };

      const ticket = currentTicket(context.state);
      if (ticket !== null) fillPoints(context, ticket, -BALANCE.failure.prRejectedPoints);
      return { kind: "retry" };
    }

    case "broken_build":
      spendEnergy(context, BALANCE.failure.brokenBuildEnergy, "broken_build");
      return { kind: "retry" };
  }
}

/**
 * Where a merge conflict may come from.
 *
 * Two histories have to actually meet. A merge is one place that happens and a
 * rebase is the other — writing a commit is not. The merge half is rolled in
 * `performMerge`; this is the rebase half.
 */
function drawFailure(context: RuleContext, kind: NodeKind): FailureEventId {
  const { state } = context;
  const onHotfix = isOnHotfix(state);
  const unreviewed = hasUnreviewedAi(state);

  const entries: { value: FailureEventId; weight: number }[] = [];

  for (const id of FAILURE_EVENT_IDS) {
    const def = FAILURE_EVENTS[id];
    if (def.requiresUnreviewedAi && !unreviewed) continue;
    if (def.forbiddenOnHotfix && onHotfix) continue;
    if (id === "merge_conflict" && kind !== "rebase") continue;

    entries.push({ value: id, weight: def.weight });
  }

  // `broken_build` carries no prerequisite, so this is a guard, not a path.
  if (entries.length === 0) return "broken_build";
  return context.rng.weighted(entries);
}

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
      rerolled: false,
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
  emit(context, { type: "incident", source, nodeId, ticketId: ticket.id });
  raiseQuality(context, BALANCE.quality.perIncident);
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
