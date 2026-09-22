import { BALANCE } from "@/game/core/balance";
import { appendLog } from "@/game/core/log";
import { isActionAvailable } from "@/game/core/rules/actions";
import { performCommit, performMerge, resolveConflictPhase } from "@/game/core/rules/commit";
import { createContext, emit, type RuleContext } from "@/game/core/rules/context";
import { applyDebtDecay, checkExplosion } from "@/game/core/rules/debt";
import { placeDevops } from "@/game/core/rules/devops";
import { checkBurnout, reportCrunch } from "@/game/core/rules/energy";
import { grantRelic } from "@/game/core/rules/grants";
import { freeReviewCadence } from "@/game/core/rules/modifiers";
import { gameOver, isOver } from "@/game/core/rules/over";
import { performReview, runFreeReview } from "@/game/core/rules/review";
import { endSprint, startNextSprint } from "@/game/core/rules/sprint";
import {
  backlogTickets,
  checkoutTicket,
  openTickets,
  startTicket,
} from "@/game/core/rules/tickets";
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
 * committing, reviewing and merging end the turn; starting a ticket, switching
 * to one and spending DevOps points do not. A commit interrupted by a merge
 * conflict defers its turn to the choice that resolves it, so one mistake
 * never costs two turns.
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

  const consumesTurn = dispatch(context, action);

  if (consumesTurn && !isOver(context)) endTurn(context);

  // Everything delivered and nothing waiting: the sprint has no reason to run
  // its clock down, so the release ships now. The player never sees a panel
  // with nothing on it.
  if (!isOver(context) && draft.phase.kind === "choose_action" && boardIsEmpty(draft)) {
    endSprint(context);
  }

  reportCrunch(context, wasCrunch);
  appendLog(draft, context.events);

  return { state: draft, events: context.events };
}

function boardIsEmpty(state: RunState): boolean {
  return openTickets(state).length === 0 && backlogTickets(state).length === 0;
}

/** Returns whether the action consumed a turn. */
function dispatch(context: RuleContext, action: PlayerAction): boolean {
  const { state } = context;

  switch (action.type) {
    case "start":
      startTicket(context, action.ticketId);
      return false;

    case "checkout":
      checkoutTicket(context, action.ticketId);
      return false;

    case "commit":
      performCommit(context, action.mode, action.kind);
      // A conflict pauses mid-turn; the turn ends when the player resolves it.
      return state.phase.kind !== "resolve_conflict";

    case "review":
      performReview(context, false);
      return true;

    case "merge":
      performMerge(context);
      return state.phase.kind !== "resolve_conflict";

    case "devops":
      placeDevops(context, action.id);
      return false;

    case "resolve_conflict":
      resolveConflictPhase(context, action.how);
      return true;

    case "choose_relic":
      grantRelic(context, action.relicId);
      startNextSprint(context);
      return false;
  }
}

function endTurn(context: RuleContext): void {
  const { state } = context;

  applyDebtDecay(context);
  runFreeReview(context, freeReviewCadence(context.effects));
  checkExplosion(context);

  state.turn += 1;
  state.sprintTurn += 1;
  emit(context, { type: "turn_started", turn: state.turn });

  // The box runs out before the burnout check: a player at zero for two turns
  // is saved by the release that ships this turn, not executed just before.
  if (state.sprintTurn >= BALANCE.sprint.turns) endSprint(context);
  if (isOver(context)) return;

  if (checkBurnout(context)) gameOver(context, "burnout");
}
