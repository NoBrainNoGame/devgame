import { BALANCE } from "@/game/core/balance";
import { appendLog } from "@/game/core/log";
import { isActionAvailable } from "@/game/core/rules/actions";
import { completeConflict, performCommit } from "@/game/core/rules/commit";
import { createContext, emit, type RuleContext } from "@/game/core/rules/context";
import { applyDebtDecay } from "@/game/core/rules/debt";
import { placeDevops } from "@/game/core/rules/devops";
import { checkBurnout, reportCrunch } from "@/game/core/rules/energy";
import { resolveConflict } from "@/game/core/rules/events";
import { grantRelic } from "@/game/core/rules/grants";
import { freeReviewCadence } from "@/game/core/rules/modifiers";
import { type AfterResolution, arriveAt, isMergeNode } from "@/game/core/rules/progress";
import { performReview, runFreeReview } from "@/game/core/rules/review";
import { endSprint, startNextSprint } from "@/game/core/rules/sprint";
import { computeScore } from "@/game/core/score";
import type { ApplyResult, PlayerAction, RunState } from "@/game/core/types";
import { InvalidActionError } from "@/game/core/types";

/**
 * The one entry point into the rules.
 *
 * Pure and total: it copies the state, never touches the caller's, consumes
 * randomness only through the cursor carried in that copy, and either returns a
 * new state or throws `InvalidActionError`. That is what lets the server replay
 * a submitted action log and get the byte-identical game the player played.
 *
 * Which actions cost a turn is a design decision, not an implementation one:
 * committing and reviewing end the turn, walking the graph and spending DevOps
 * points do not. A commit interrupted by a merge conflict defers its turn to
 * the choice that resolves it, so one mistake never costs two turns.
 */
export function applyAction(state: RunState, action: PlayerAction): ApplyResult {
  if (state.phase.kind === "game_over") {
    throw new InvalidActionError("The run is over");
  }
  if (!isActionAvailable(state, action)) {
    throw new InvalidActionError(
      `${action.type} is not available during phase ${state.phase.kind}`,
    );
  }

  const draft = structuredClone(state);
  const context = createContext(draft);
  const wasCrunch = draft.player.energy <= BALANCE.energy.crunchThreshold;

  const { after, consumesTurn } = dispatch(context, action);

  if (after === "sprint_end") endSprint(context);
  if (consumesTurn) endTurn(context);

  reportCrunch(context, wasCrunch);
  appendLog(draft, context.events);

  return { state: draft, events: context.events };
}

function dispatch(
  context: RuleContext,
  action: PlayerAction,
): { after: AfterResolution; consumesTurn: boolean } {
  const { state } = context;

  switch (action.type) {
    case "commit": {
      const after = performCommit(context, action.mode, action.kind);
      // A conflict pauses mid-turn; the turn ends when the player resolves it.
      return { after, consumesTurn: state.phase.kind !== "resolve_conflict" };
    }

    case "review":
      performReview(context, false);
      return { after: "continue", consumesTurn: true };

    case "move":
      return { after: arriveAt(context, action.nodeId), consumesTurn: false };

    case "devops":
      placeDevops(context, action.id);
      return { after: "continue", consumesTurn: false };

    case "resolve_conflict": {
      const phase = state.phase;
      const mode = phase.kind === "resolve_conflict" ? phase.mode : "craft";

      if (!resolveConflict(context, action.how)) {
        // Still tangled. A merge cannot be walked away from — the branch is
        // half-applied and the only way out is through — so the question stays
        // on the table. Anywhere else the node simply waits.
        const node = state.nodes[state.player.nodeId];
        state.phase =
          node !== undefined && isMergeNode(node)
            ? { kind: "resolve_conflict", nodeId: node.id, mode }
            : { kind: "choose_action" };
        return { after: "continue", consumesTurn: true };
      }

      return { after: completeConflict(context, mode), consumesTurn: true };
    }

    case "choose_relic":
      grantRelic(context, action.relicId);
      startNextSprint(context);
      return { after: "continue", consumesTurn: false };
  }
}

function endTurn(context: RuleContext): void {
  const { state } = context;

  applyDebtDecay(context);
  runFreeReview(context, freeReviewCadence(context.effects));

  state.turn += 1;
  emit(context, { type: "turn_started", turn: state.turn });

  if (checkBurnout(context)) gameOver(context, "burnout");
}

function gameOver(context: RuleContext, reason: "burnout" | "fired"): void {
  const score = computeScore(context.state);
  context.state.phase = { kind: "game_over", reason };
  emit(context, { type: "game_over", reason, score });
}
