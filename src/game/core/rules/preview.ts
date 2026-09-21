import { DEVOPS, devopsCost } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { type I18nText, text } from "@/game/core/i18n";
import { getNode } from "@/game/core/map/graph";
import {
  commitChance,
  conflictChance,
  gatherEffects,
  nodeEnergyCost,
  reviewCleanCount,
  reviewEnergyCost,
} from "@/game/core/rules/modifiers";
import type { ActionPreview, PlayerAction, RunState } from "@/game/core/types";

/**
 * What an action will cost and what it might do, worked out before the player
 * commits to it.
 *
 * The original design kept the dice hidden. Showing them does not remove the
 * dilemma — a 70 % gamble that saves two energy against a 92 % one that costs
 * three is still a decision — it just moves the difficulty from "guess the
 * rules" to "weigh the odds", which is the game worth playing.
 */
export function getActionPreview(state: RunState, action: PlayerAction): ActionPreview {
  const effects = gatherEffects(state);

  switch (action.type) {
    case "commit": {
      const node = getNode(state, state.player.nodeId);
      const cost = nodeEnergyCost(state, node, action.mode, effects);
      const chance = commitChance(state, action.mode, node, effects);
      const notes = [...cost.notes, ...chance.notes];

      const { aiJump } = BALANCE.commit;
      const jumpMin = action.mode === "ai" ? aiJump.min + effects.aiJumpBonus : 0;
      const jumpMax = action.mode === "ai" ? aiJump.max + effects.aiJumpBonus : 0;

      const baseDebt =
        action.mode === "ai" ? BALANCE.debt.perAiCommit : BALANCE.debt.perCraftCommit;
      const nodeDebt = node.kind === "risky" ? BALANCE.debt.perRiskyNode : 0;
      const jumpDebt = BALANCE.debt.perAiJumpNode;

      return {
        action,
        energyCost: cost.value,
        successPct: chance.value,
        // The jump is a maximum, not a promise: it stops at the next decision.
        progress: [1, 1 + jumpMax],
        debtDelta: [
          baseDebt + nodeDebt + jumpMin * jumpDebt,
          baseDebt + nodeDebt + jumpMax * jumpDebt,
        ],
        botsAdvance: true,
        notes,
      };
    }

    case "review": {
      const cost = reviewEnergyCost(state, effects);
      const unreviewed = state.player.aiHistory.filter((entry) => !entry.reviewed).length;
      const cleaned = Math.min(unreviewed, reviewCleanCount(state, effects));
      // `-0` would be correct arithmetic and a nuisance everywhere downstream.
      const repaid = cleaned * BALANCE.review.repayPerCommit;
      const delta = repaid === 0 ? 0 : -repaid;

      const notes: I18nText[] = [...cost.notes];
      if (state.player.aiChain >= BALANCE.review.chainLength) notes.push(text("notes.fresh"));
      if (unreviewed === 0) notes.push(text("notes.nothing_to_review"));

      return {
        action,
        energyCost: cost.value,
        progress: [0, 0],
        debtDelta: [delta, delta],
        botsAdvance: true,
        notes,
      };
    }

    case "move": {
      const node = getNode(state, action.nodeId);
      const isMerge = node.kind === "feature_merge" || node.kind === "sprint_merge";
      const cost = isMerge ? nodeEnergyCost(state, node, undefined, effects) : undefined;

      const notes: I18nText[] = [...(cost?.notes ?? [])];
      if (node.kind === "refactor") notes.push(text("notes.repays_debt"));
      if (node.kind === "risky") notes.push(text("notes.risky_node"));
      if (node.kind === "chore") notes.push(text("notes.chore_node"));
      if (node.skillId !== undefined) notes.push(text("notes.grants_skill"));

      return {
        action,
        energyCost: cost?.value ?? 0,
        progress: [0, 0],
        debtDelta: node.kind === "refactor" ? [-BALANCE.debt.refactorRepay, 0] : [0, 0],
        // Walking is not working: the rivals only move when you do.
        botsAdvance: false,
        notes,
      };
    }

    case "devops": {
      const level = state.devops[action.id] ?? 0;
      const cost = devopsCost(action.id, level);

      return {
        action,
        energyCost: 0,
        botsAdvance: false,
        notes: [text("notes.devops_cost", { points: cost ?? 0 })],
        ...(cost === undefined
          ? { blocked: text("notes.devops_maxed", { max: DEVOPS[action.id].maxLevel }) }
          : cost > state.devopsPoints
            ? { blocked: text("notes.devops_too_expensive", { points: cost }) }
            : {}),
      };
    }

    case "resolve_conflict": {
      if (action.how === "manual") {
        const chance = conflictChance(state, effects);
        return {
          action,
          energyCost: BALANCE.failure.conflictManualEnergy,
          successPct: chance.value,
          botsAdvance: true,
          notes: chance.notes,
        };
      }

      return {
        action,
        energyCost: 0,
        debtDelta: [BALANCE.debt.perAiConflictFix, BALANCE.debt.perAiConflictFix],
        botsAdvance: true,
        notes: [text("notes.hidden_bug_risk", { percent: BALANCE.failure.conflictAiHiddenBugPct })],
      };
    }

    case "choose_relic":
      return {
        action,
        energyCost: 0,
        botsAdvance: false,
        notes: [],
      };
  }
}

/** Previews for everything currently legal, keyed for the HUD. */
export function previewAll(
  state: RunState,
  actions: readonly PlayerAction[],
): Record<string, ActionPreview> {
  const out: Record<string, ActionPreview> = {};
  for (const action of actions) out[actionKey(action)] = getActionPreview(state, action);
  return out;
}

/** A stable string for an action, so React can key on it. */
export function actionKey(action: PlayerAction): string {
  switch (action.type) {
    case "commit":
      return `commit:${action.mode}`;
    case "move":
      return `move:${action.nodeId}`;
    case "devops":
      return `devops:${action.id}`;
    case "resolve_conflict":
      return `conflict:${action.how}`;
    case "choose_relic":
      return `relic:${action.relicId}`;
    case "review":
      return "review";
  }
}
