import { DEVOPS, devopsCost } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { type I18nText, text } from "@/game/core/i18n";
import { commitKindFor } from "@/game/core/rules/commit";
import {
  commitChance,
  conflictChance,
  gatherEffects,
  mergeEventChance,
  nodeEnergyCost,
  reviewCleanCount,
  reviewEnergyCost,
} from "@/game/core/rules/modifiers";
import { behindOf, currentTicket, getTicket, unreadAiOn } from "@/game/core/rules/tickets";
import { pointsFor } from "@/game/core/rules/write";
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
    case "start": {
      const ticket = getTicket(state, action.ticketId);
      const notes: I18nText[] = [];
      if (ticket.skillId !== undefined) notes.push(text("notes.grants_skill"));
      return { action, energyCost: 0, consumesTurn: false, notes };
    }

    case "checkout":
      return { action, energyCost: 0, consumesTurn: false, notes: [] };

    case "commit": {
      const ticket = currentTicket(state);
      if (ticket === null) return { action, energyCost: 0, consumesTurn: true, notes: [] };

      // Priced as the thing it would become: a refactor's odds and its price
      // are the refactor's, not the plain commit's it is offered beside.
      const kind = commitKindFor(ticket, action.kind);

      const cost = nodeEnergyCost(state, kind, action.mode);
      const chance = commitChance(state, action.mode, kind, effects);
      const notes: I18nText[] = [...cost.notes, ...chance.notes];

      let debt = 0;
      if (action.mode === "ai") {
        // Documentation pays the debt of the next machine-written commit, so
        // the preview shows the covered price rather than the rate.
        if (state.player.docsCharges > 0) {
          notes.push(text("notes.documented", { count: state.player.docsCharges }));
        } else {
          debt = Math.max(0, BALANCE.debt.perAiCommit - effects.aiDebtDiscount);
        }
      } else {
        debt = BALANCE.debt.perCraftCommit;
      }
      if (kind === "risky") debt += BALANCE.debt.perRiskyNode;
      if (kind === "refactor") debt -= BALANCE.debt.refactorRepay;

      if (kind === "rebase") {
        notes.push(text("notes.rebase_why", { count: behindOf(state, ticket) }));
        if (!effects.absorbRebase) {
          notes.push(text("notes.rebase_risk", { debt: BALANCE.rebase.failureDebt }));
        }
      }

      const points = pointsFor(ticket, action.mode, kind);

      return {
        action,
        energyCost: cost.value,
        successPct: chance.value,
        points: [points, points],
        debtDelta: [debt, debt],
        consumesTurn: true,
        notes,
      };
    }

    case "review": {
      const ticket = currentTicket(state);
      const cost = reviewEnergyCost(state, effects);
      const unreviewed = ticket === null ? 0 : unreadAiOn(state, ticket).length;
      const cleaned = Math.min(unreviewed, reviewCleanCount(state, effects));
      // `-0` would be correct arithmetic and a nuisance everywhere downstream.
      const repaid = cleaned * BALANCE.review.repayPerCommit;
      const delta = repaid === 0 ? 0 : -repaid;

      const notes: I18nText[] = [...cost.notes];
      if (state.player.aiChain >= BALANCE.review.chainLength) notes.push(text("notes.fresh"));

      return {
        action,
        energyCost: cost.value,
        debtDelta: [delta, delta],
        consumesTurn: true,
        notes,
      };
    }

    case "submit": {
      const ticket = currentTicket(state);
      const cost = nodeEnergyCost(state, "feature_merge", undefined);
      const notes: I18nText[] = [...cost.notes];
      if (ticket !== null) {
        const unread = unreadAiOn(state, ticket).length;
        if (unread > 0) notes.push(text("notes.unread_risk", { count: unread }));
        if (state.debt > BALANCE.acceptance.maxDebt) {
          notes.push(text("notes.debt_refusal", { max: BALANCE.acceptance.maxDebt }));
        }
        const risk = mergeEventChance(state, ticket);
        if (risk > 0) notes.push(text("notes.merge_risk", { percent: risk }));
        const behind = behindOf(state, ticket);
        if (behind > 0) notes.push(text("notes.behind_dev", { count: behind }));
      }
      const regen = BALANCE.energy.featureMergeRegen + effects.mergeRegenBonus;
      notes.push(text("notes.merge_regen", { energy: regen }));

      return {
        action,
        energyCost: cost.value,
        consumesTurn: true,
        notes,
      };
    }

    case "restart":
    case "resume":
      return { action, energyCost: 0, consumesTurn: false, notes: [] };

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
      return { action, energyCost: 0, consumesTurn: false, notes: [] };
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
    case "start":
      return `start:${action.ticketId}`;
    case "checkout":
      return `checkout:${action.ticketId}`;
    case "commit":
      return action.kind === undefined
        ? `commit:${action.mode}`
        : `commit:${action.mode}:${action.kind}`;
    case "devops":
      return `devops:${action.id}`;
    case "resolve_conflict":
      return `conflict:${action.how}`;
    case "choose_relic":
      return `relic:${action.relicId}`;
    case "review":
    case "submit":
    case "restart":
    case "resume":
      return action.type;
  }
}
