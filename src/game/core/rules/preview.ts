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
      const standing = getNode(state, state.player.nodeId);
      // Priced as the thing it would become: a refactor's odds and its price
      // are the refactor's, not the plain commit's it is offered beside.
      const node =
        action.kind !== undefined && standing.offers === action.kind
          ? { ...standing, kind: action.kind }
          : standing;

      const cost = nodeEnergyCost(state, node, action.mode, effects);
      const chance = commitChance(state, action.mode, node, effects);
      const notes: I18nText[] = [...cost.notes, ...chance.notes];

      const { aiJump } = BALANCE.commit;
      const jumpMin = action.mode === "ai" ? aiJump.min + effects.aiJumpBonus : 0;
      const jumpMax = action.mode === "ai" ? aiJump.max + effects.aiJumpBonus : 0;

      // Documentation pays the debt of the next few machine-written nodes, so
      // the preview has to count the charges rather than the rate. Showing the
      // full price on a covered commit would hide the whole point of the node.
      const charges = action.mode === "ai" ? state.player.docsCharges : 0;
      if (charges > 0) notes.push(text("notes.documented", { count: charges }));

      const aiDebt = (nodes: number): number => {
        if (action.mode !== "ai") return BALANCE.debt.perCraftCommit;
        const covered = Math.min(charges, 1 + nodes);
        const paid = 1 + nodes - covered;
        // The primary node costs more than a jumped one, and charges are spent
        // in order, so the first uncovered node is the expensive one.
        if (paid === 0) return 0;
        const primaryPaid = covered === 0 ? BALANCE.debt.perAiCommit : 0;
        const jumpsPaid = paid - (covered === 0 ? 1 : 0);
        return primaryPaid + jumpsPaid * BALANCE.debt.perAiJumpNode;
      };

      const nodeDebt = node.kind === "risky" ? BALANCE.debt.perRiskyNode : 0;
      const rebaseDebt = node.kind === "rebase" ? BALANCE.rebase.failureDebt : 0;
      if (rebaseDebt > 0) notes.push(text("notes.rebase_risk", { debt: rebaseDebt }));

      const carried = node.kind === "rebase" ? BALANCE.rebase.carry : 0;

      return {
        action,
        energyCost: cost.value,
        successPct: chance.value,
        // The jump is a maximum, not a promise: it stops at the next decision.
        progress: [1 + carried, 1 + carried + jumpMax],
        debtDelta: [nodeDebt + aiDebt(jumpMin), nodeDebt + aiDebt(jumpMax)],
        consumesTurn: true,
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

      return {
        action,
        energyCost: cost.value,
        progress: [0, 0],
        debtDelta: [delta, delta],
        consumesTurn: true,
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
        // Walking is not working: it costs no turn.
        consumesTurn: false,
        notes,
      };
    }

    case "devops": {
      const level = state.devops[action.id] ?? 0;
      const cost = devopsCost(action.id, level);

      return {
        action,
        energyCost: 0,
        consumesTurn: false,
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
          consumesTurn: true,
          notes: chance.notes,
        };
      }

      return {
        action,
        energyCost: 0,
        debtDelta: [BALANCE.debt.perAiConflictFix, BALANCE.debt.perAiConflictFix],
        consumesTurn: true,
        notes: [text("notes.hidden_bug_risk", { percent: BALANCE.failure.conflictAiHiddenBugPct })],
      };
    }

    case "choose_relic":
      return {
        action,
        energyCost: 0,
        consumesTurn: false,
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
      return action.kind === undefined
        ? `commit:${action.mode}`
        : `commit:${action.mode}:${action.kind}`;
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
