import { BALANCE } from "@/game/core/balance";
import { appendLog } from "@/game/core/log";
import {
  performMerge,
  performSubmit,
  restartTicket,
  resumeTicket,
} from "@/game/core/rules/acceptance";
import { acquire } from "@/game/core/rules/acquisitions";
import { isActionAvailable } from "@/game/core/rules/actions";
import { reportCapacity } from "@/game/core/rules/capacity";
import { performCommit, resolveConflictPhase } from "@/game/core/rules/commit";
import { createContext, emit, type RuleContext } from "@/game/core/rules/context";
import { applyDebtDecay, checkExplosion } from "@/game/core/rules/debt";
import { closeMonth, monthTurns } from "@/game/core/rules/economy";
import { checkBurnout, performRest, reportCrunch } from "@/game/core/rules/energy";
import { grantRelic } from "@/game/core/rules/grants";
import { performHack } from "@/game/core/rules/hack";
import { freeReviewCadence } from "@/game/core/rules/modifiers";
import { answerEvent, maybeNarrative } from "@/game/core/rules/narrative";
import { gameOver, isOver } from "@/game/core/rules/over";
import { performReview, runFreeReview } from "@/game/core/rules/review";
import { buySkillPoint, buyUpgrade } from "@/game/core/rules/shop";
import { endSprint, startNextSprint } from "@/game/core/rules/sprint";
import { hireDev, workTeam } from "@/game/core/rules/team";
import {
  backlogTickets,
  checkoutTicket,
  openTickets,
  startTicket,
} from "@/game/core/rules/tickets";
import { placeTree } from "@/game/core/rules/tree";
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
 * committing, reviewing and merging end the turn, and so does a submit that
 * comes back refused; starting a ticket, switching to one, answering a
 * rejection and spending skill points do not. A submit that is accepted
 * hands its turn to the merge that follows, and a merge conflict defers it
 * again to the choice that resolves it, so one review never costs two turns.
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
      // The objective counts the hand you reached for, landed or not.
      if (action.mode === "ai") state.sprintCounters.aiCommits += 1;
      performCommit(context, action.mode, action.kind);
      // A conflict pauses mid-turn; the turn ends when the player resolves it.
      return state.phase.kind !== "resolve_conflict";

    case "review":
      performReview(context, false);
      return true;

    case "rest":
      performRest(context);
      return true;

    case "submit":
      performSubmit(context);
      return state.phase.kind === "ticket_rejected";

    case "merge":
      performMerge(context);
      return state.phase.kind !== "resolve_conflict";

    case "restart":
      restartTicket(context);
      return false;

    case "resume":
      resumeTicket(context);
      return false;

    case "tree":
      placeTree(context, action.id);
      return false;

    case "buy":
      buyUpgrade(context, action.id);
      return false;

    case "buy_point":
      buySkillPoint(context);
      return false;

    case "hire":
      hireDev(context, action.rank);
      return false;

    case "acquire":
      acquire(context, action.id);
      return false;

    case "hack":
      performHack(context);
      return true;

    case "answer":
      answerEvent(context, action.eventId, action.choice);
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
  // The team works after you, on this turn's board, so a merge of theirs
  // lands on `dev` before the release that might ship this turn.
  workTeam(context);
  // With this turn's board landed, say whether the servers will hold: the
  // warning comes before the payday that would punish, not after.
  reportCapacity(context);

  state.turn += 1;
  state.sprintTurn += 1;
  emit(context, { type: "turn_started", turn: state.turn });

  // Payday falls on the month's last turn; the sprint's own end closes
  // whatever months it cut short, so a payday is never paid twice.
  if (state.sprintTurn % monthTurns() === 0 && state.sprintTurn < BALANCE.sprint.turns) {
    closeMonth(context);
    if (isOver(context)) return;
    maybeNarrative(context, "payday");
  }
  if (isOver(context)) return;

  // The box runs out before the burnout check: a player at zero for two turns
  // is saved by the release that ships this turn, not executed just before.
  if (state.sprintTurn >= BALANCE.sprint.turns) endSprint(context);
  if (isOver(context)) return;

  if (checkBurnout(context)) gameOver(context, "burnout");
}
