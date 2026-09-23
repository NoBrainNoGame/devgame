import { OBJECTIVE_IDS, OBJECTIVES, type ObjectiveId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { ticketsFor } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { grantSkillPoints } from "@/game/core/rules/grants";
import { changeMoney } from "@/game/core/rules/money";
import { raiseQuality } from "@/game/core/rules/quality";
import { tierScale } from "@/game/core/rules/tier";
import type { RunState } from "@/game/core/types";

/**
 * What a sprint asks. One weighted draw at every sprint's start — made
 * whatever is eligible, and falling back to the plainest objective when the
 * drawn one needs a ticket the board does not have — and a settlement at
 * the release, before the bugs ship, so the reward lands on the sprint
 * that earned it.
 */

function eligible(state: RunState, id: ObjectiveId): boolean {
  const def = OBJECTIVES[id];
  if (state.tier < def.minTier) return false;
  if (def.requires !== undefined) {
    return Object.values(state.tickets).some(
      (ticket) => ticket.kind === def.requires && ticket.status === "backlog",
    );
  }
  return true;
}

function targetOf(state: RunState, id: ObjectiveId): number {
  switch (id) {
    case "deliver_n":
      return Math.max(
        1,
        Math.floor(
          (ticketsFor(state.sprint, state.tier) * BALANCE.objectives.deliverSharePct) / 100,
        ),
      );
    case "debt_under":
      return BALANCE.objectives.debtUnder;
    case "deliver_vip":
    case "deliver_bug":
      return 1;
    case "zero_incident":
    case "review_all":
    case "no_rest":
    case "by_hand":
      return 0;
  }
}

function noteObjective(
  table: Record<string, { done: number; failed: number }>,
  id: ObjectiveId,
  outcome: "done" | "failed",
): void {
  const entry = table[id] ?? { done: 0, failed: 0 };
  entry[outcome] += 1;
  table[id] = entry;
}

export function drawObjective(context: RuleContext): void {
  const { state, rng } = context;
  // One draw, always; the fallback keeps the stream where it was.
  const drawn = rng.weighted(
    OBJECTIVE_IDS.map((id) => ({ value: id, weight: OBJECTIVES[id].weight })),
  );
  const id: ObjectiveId = eligible(state, drawn) ? drawn : "deliver_n";
  const target = targetOf(state, id);
  state.objective = { id, target };
  state.sprintCounters = { rests: 0, aiCommits: 0, vipDelivered: 0, bugsDelivered: 0 };
  emit(context, { type: "objective_set", id, target });
}

/** How far along the sprint's objective is, in the unit its target counts. */
export function objectiveProgress(state: RunState): number {
  const objective = state.objective;
  if (objective === null) return 0;
  const { sprintCounters: counters } = state;
  switch (objective.id) {
    case "deliver_n":
      return state.sprintPlayerDelivered;
    case "zero_incident":
      return state.sprintIncidents;
    case "review_all":
      return state.shipped.filter((id) => {
        const node = state.nodes[id];
        return node !== undefined && node.commit.mode === "ai" && !node.commit.reviewed;
      }).length;
    case "debt_under":
      return state.debt;
    case "deliver_vip":
      return counters.vipDelivered;
    case "no_rest":
      return counters.rests;
    case "by_hand":
      return counters.aiCommits;
    case "deliver_bug":
      return counters.bugsDelivered;
  }
}

export function objectiveMet(state: RunState): boolean {
  const objective = state.objective;
  if (objective === null) return false;
  const progress = objectiveProgress(state);
  switch (objective.id) {
    case "deliver_n":
    case "deliver_vip":
    case "deliver_bug":
      return progress >= objective.target;
    case "debt_under":
      return progress < objective.target;
    case "zero_incident":
    case "review_all":
    case "no_rest":
    case "by_hand":
      return progress === 0;
  }
}

/** Settles the sprint's objective. Returns whether the relic offer grows by one. */
export function settleObjective(context: RuleContext): boolean {
  const { state } = context;
  const objective = state.objective;
  if (objective === null || objective.outcome !== undefined) return false;
  const def = OBJECTIVES[objective.id];

  if (!objectiveMet(state)) {
    objective.outcome = "failed";
    noteObjective(state.stats.objectives, objective.id, "failed");
    emit(context, { type: "objective_failed", id: objective.id });
    if (def.failPatience !== undefined) raiseQuality(context, def.failPatience, "objective");
    return false;
  }

  objective.outcome = "done";
  noteObjective(state.stats.objectives, objective.id, "done");
  emit(context, { type: "objective_done", id: objective.id, reward: def.reward });
  switch (def.reward) {
    case "money":
      changeMoney(
        context,
        BALANCE.objectives.moneyReward * tierScale(state.tier, BALANCE.economy.tier.mrrGrowth),
        "objective",
      );
      return false;
    case "point":
      grantSkillPoints(context, 1);
      return false;
    case "relics":
      return true;
  }
}
