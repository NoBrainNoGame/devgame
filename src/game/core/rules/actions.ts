import { DEVOPS_IDS } from "@/game/content";
import { canPlaceDevops } from "@/game/core/rules/devops";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { canReview } from "@/game/core/rules/review";
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
 * repays nothing, costs energy and lets every rival move. An action that can
 * only ever make things worse is not a decision, it is a trap.
 */
export function getAvailableActions(state: RunState): PlayerAction[] {
  switch (state.phase.kind) {
    case "choose_action": {
      const actions: PlayerAction[] = [
        { type: "commit", mode: "craft" },
        { type: "commit", mode: "ai" },
      ];
      if (canReview(state, gatherEffects(state))) actions.push({ type: "review" });
      for (const id of DEVOPS_IDS) {
        if (canPlaceDevops(state, id)) actions.push({ type: "devops", id });
      }
      return actions;
    }

    case "choose_node": {
      const actions: PlayerAction[] = state.phase.candidates
        .map((nodeId) => ({ type: "move", nodeId }) as const)
        .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
      // Points may also be spent between two nodes: it costs no turn either way.
      for (const id of DEVOPS_IDS) {
        if (canPlaceDevops(state, id)) actions.push({ type: "devops", id });
      }
      return actions;
    }

    case "resolve_conflict":
      return [
        { type: "resolve_conflict", how: "manual" },
        { type: "resolve_conflict", how: "ai" },
      ];

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
    case "commit":
      return b.type === "commit" && a.mode === b.mode;
    case "move":
      return b.type === "move" && a.nodeId === b.nodeId;
    case "devops":
      return b.type === "devops" && a.id === b.id;
    case "resolve_conflict":
      return b.type === "resolve_conflict" && a.how === b.how;
    case "choose_relic":
      return b.type === "choose_relic" && a.relicId === b.relicId;
    case "review":
      return true;
  }
}

export function isActionAvailable(state: RunState, action: PlayerAction): boolean {
  return getAvailableActions(state).some((candidate) => isSameAction(candidate, action));
}
