import {
  AMBIENT_EVENT_IDS,
  AMBIENT_EVENTS,
  type AmbientEventId,
  FAILURE_EVENT_IDS,
  FAILURE_EVENTS,
  type FailureEventId,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { isOnHotfix } from "@/game/core/map/graph";
import { failurePressure } from "@/game/core/rules/bots";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { injectBranch } from "@/game/core/rules/inject";
import { conflictChance } from "@/game/core/rules/modifiers";
import { hasUnreviewedAi } from "@/game/core/rules/review";

/**
 * What a missed roll costs you.
 *
 * Only half of the table actually takes the turn away. A merge conflict hands
 * you a second decision instead, and the two rival-driven failures are exactly
 * the ones a skill can neutralise — so the answer to "the Reviewer keeps
 * blocking me" is a build, not luck.
 */

export type FailureOutcome =
  /** The node stays unresolved and the reducer opens the conflict choice. */
  | { kind: "conflict" }
  /** Something handled it: resolve the node as if the roll had passed. */
  | { kind: "resolve" }
  /** The turn is gone; the node must be attempted again. */
  | { kind: "retry" }
  /** It shipped, and it broke production. A hotfix branch is now in the way. */
  | { kind: "resolve_then_hotfix" };

export function resolveFailure(context: RuleContext): FailureOutcome {
  const eventId = drawFailure(context);
  emit(context, { type: "failure_event", eventId });

  switch (eventId) {
    case "merge_conflict":
      return { kind: "conflict" };

    case "prod_bug":
      return { kind: "resolve_then_hotfix" };

    case "pr_rejected": {
      const countered = context.effects.counterPrRejection;
      const { reviewerId } = failurePressure(context.state);
      emit(context, { type: "pr_rejected", botId: reviewerId, countered });

      if (countered) return { kind: "resolve" };

      context.state.player.sprintProgress = Math.max(
        0,
        context.state.player.sprintProgress - BALANCE.failure.prRejectedProgress,
      );
      return { kind: "retry" };
    }

    case "forced_rebase": {
      const absorbed = context.effects.absorbRebase;
      emit(context, {
        type: "forced_rebase",
        nodeId: context.state.player.nodeId,
        absorbed,
      });
      return absorbed ? { kind: "resolve" } : { kind: "retry" };
    }
  }
}

function drawFailure(context: RuleContext): FailureEventId {
  const { state } = context;
  const pressure = failurePressure(state);
  const onHotfix = isOnHotfix(state);
  const unreviewed = hasUnreviewedAi(context);

  const entries: { value: FailureEventId; weight: number }[] = [];

  for (const id of FAILURE_EVENT_IDS) {
    const def = FAILURE_EVENTS[id];
    if (def.requiresUnreviewedAi && !unreviewed) continue;
    if (def.forbiddenOnHotfix && onHotfix) continue;

    let weight = def.weight;

    if (id === "pr_rejected") {
      weight += pressure.prRejected;
      // A well-read codebase gives a reviewer less to object to.
      const ratio = reviewedShare(context);
      weight *= 1 - ratio * BALANCE.failure.reviewedRatioDamping;
    }
    if (id === "forced_rebase") {
      weight += pressure.forcedRebase;
    }

    if (weight > 0) entries.push({ value: id, weight });
  }

  if (entries.length === 0) return "merge_conflict";
  return context.rng.weighted(entries);
}

function reviewedShare(context: RuleContext): number {
  const history = context.state.player.aiHistory;
  if (history.length === 0) return 1;
  return history.filter((entry) => entry.reviewed).length / history.length;
}

/**
 * The two ways out of a merge conflict, and neither is free.
 *
 * By hand costs energy and can still fail, which is what makes conflict
 * resistance worth building. By machine always works, and quietly adds debt —
 * sometimes with a bug attached, which is the hotfix you will walk next.
 *
 * Returns whether the interrupted commit now goes through.
 */
export function resolveConflict(context: RuleContext, how: "manual" | "ai"): boolean {
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

    return outcome.success;
  }

  addDebt(context, BALANCE.debt.perAiConflictFix);
  const hiddenBug = context.rng.chance(BALANCE.failure.conflictAiHiddenBugPct);
  emit(context, { type: "conflict_resolved", how, hiddenBug });

  if (hiddenBug) injectHotfix(context);

  return true;
}

export function injectHotfix(context: RuleContext): void {
  const count = context.effects.monitoring
    ? BALANCE.failure.hotfixNodesWithMonitoring
    : BALANCE.failure.hotfixNodes;

  injectBranch(context, "hotfix", count);
  context.state.monitoringWarning = false;
}

export function injectRefactor(context: RuleContext): void {
  const result = injectBranch(context, "refactor", BALANCE.debt.explosionNodes);
  if (result === null) return;

  emit(context, { type: "debt_explosion", branchId: result.branchId });
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
  if (effect.progress !== undefined) {
    context.state.player.sprintProgress += effect.progress;
  }

  return eventId;
}
