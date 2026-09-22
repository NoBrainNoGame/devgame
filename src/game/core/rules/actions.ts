import { DEV_RANKS, TREE_IDS, UPGRADE_IDS } from "@/game/content";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { canReview } from "@/game/core/rules/review";
import { canBuySkillPoint, canBuyUpgrade } from "@/game/core/rules/shop";
import { canHire } from "@/game/core/rules/team";
import {
  backlogTickets,
  currentTicket,
  isReady,
  offersOf,
  playerTickets,
} from "@/game/core/rules/tickets";
import { canPlaceTree } from "@/game/core/rules/tree";
import type { PlayerAction, RunState } from "@/game/core/types";

/**
 * Every move the player may legally make right now.
 *
 * The reducer refuses anything not in this list, so it is the one definition of
 * what is legal — the HUD, the tests and the server-side replay all read the
 * same answer.
 *
 * Note what is *not* gated on energy: a commit you cannot afford is still
 * legal. Energy clamps at zero and burnout takes a full turn to arrive, which
 * is the difference between a hard decision and a dead end.
 *
 * Review is gated, on two counts. It has to have been learned, and it has to
 * have something to read: a review with no unread machine-written commit
 * repays nothing, costs energy and spends a turn. An action that can only
 * ever make things worse is not a decision, it is a trap. Submitting the
 * ticket for review is gated the same way: it exists once the points are
 * full, and not before.
 */
export function getAvailableActions(state: RunState): PlayerAction[] {
  switch (state.phase.kind) {
    case "choose_action": {
      const actions: PlayerAction[] = [];
      const ticket = currentTicket(state);

      for (const waiting of backlogTickets(state)) {
        actions.push({ type: "start", ticketId: waiting.id });
      }
      for (const open of playerTickets(state)) {
        if (open.id !== ticket?.id) actions.push({ type: "checkout", ticketId: open.id });
      }

      if (ticket !== null) {
        actions.push({ type: "commit", mode: "craft" }, { type: "commit", mode: "ai" });

        // What this commit could be written as instead. Both hands, because
        // letting the machine write a refactor is a real and bad idea.
        for (const kind of offersOf(state, ticket)) {
          actions.push({ type: "commit", mode: "craft", kind });
          actions.push({ type: "commit", mode: "ai", kind });
        }

        if (canReview(state, gatherEffects(state))) actions.push({ type: "review" });
        if (isReady(state, ticket)) actions.push({ type: "submit" });
      }
      actions.push({ type: "rest" });

      for (const id of TREE_IDS) {
        if (canPlaceTree(state, id)) actions.push({ type: "tree", id });
      }

      // The shop, gated on affordability here rather than refused later: a
      // free action that changes nothing would read as a stuck run.
      const effects = gatherEffects(state);
      for (const id of UPGRADE_IDS) {
        if (canBuyUpgrade(state, id)) actions.push({ type: "buy", id });
      }
      if (canBuySkillPoint(state)) actions.push({ type: "buy_point" });
      for (const rank of DEV_RANKS) {
        if (canHire(state, effects, rank)) actions.push({ type: "hire", rank });
      }
      return actions;
    }

    case "resolve_conflict":
      return [
        { type: "resolve_conflict", how: "manual" },
        { type: "resolve_conflict", how: "ai" },
      ];

    case "pr_accepted":
      return [{ type: "merge" }];

    case "ticket_rejected":
      return [{ type: "restart" }, { type: "resume" }];

    case "choose_relic":
      return state.phase.offer.map((relicId) => ({ type: "choose_relic", relicId }) as const);

    case "game_over":
      return [];
  }
}

/** Structural equality, used by the reducer to validate an incoming action. */
export function isSameAction(a: PlayerAction, b: PlayerAction): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case "start":
      return b.type === "start" && a.ticketId === b.ticketId;
    case "checkout":
      return b.type === "checkout" && a.ticketId === b.ticketId;
    case "commit":
      return b.type === "commit" && a.mode === b.mode && a.kind === b.kind;
    case "tree":
      return b.type === "tree" && a.id === b.id;
    case "buy":
      return b.type === "buy" && a.id === b.id;
    case "hire":
      return b.type === "hire" && a.rank === b.rank;
    case "resolve_conflict":
      return b.type === "resolve_conflict" && a.how === b.how;
    case "choose_relic":
      return b.type === "choose_relic" && a.relicId === b.relicId;
    case "review":
    case "rest":
    case "submit":
    case "merge":
    case "restart":
    case "resume":
    case "buy_point":
      return true;
  }
}

export function isActionAvailable(state: RunState, action: PlayerAction): boolean {
  return getAvailableActions(state).some((candidate) => isSameAction(candidate, action));
}
