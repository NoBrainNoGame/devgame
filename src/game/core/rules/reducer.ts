import type { WorldEventId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { appendLog } from "@/game/core/log";
import {
  followupTicket,
  performMerge,
  performSubmit,
  resumeTicket,
} from "@/game/core/rules/acceptance";
import { acquire } from "@/game/core/rules/acquisitions";
import { isActionAvailable } from "@/game/core/rules/actions";
import { reportCapacity } from "@/game/core/rules/capacity";
import { performCommit, resolveConflictPhase } from "@/game/core/rules/commit";
import { createContext, emit, type RuleContext } from "@/game/core/rules/context";
import {
  actorOf,
  forEachSeat,
  isCrew,
  joinSeat,
  leaveSeat,
  missRound,
  occupiedSeats,
  phaseOf,
  playerOf,
  SOLO_SEAT,
} from "@/game/core/rules/crew";
import { applyDebtDecay, checkExplosion } from "@/game/core/rules/debt";
import { applyDevValues } from "@/game/core/rules/dev";
import { closeMonth, monthTurns } from "@/game/core/rules/economy";
import { burnedOut, passTurn, performRest, reportCrunch } from "@/game/core/rules/energy";
import { performHack } from "@/game/core/rules/hack";
import { forgetOldHistory } from "@/game/core/rules/history";
import { freeReviewCadence, nothingToDo } from "@/game/core/rules/modifiers";
import { answerEvent, maybeNarrative } from "@/game/core/rules/narrative";
import { gameOver, isOver } from "@/game/core/rules/over";
import { chooseRelic, sprintTurns } from "@/game/core/rules/relics";
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
import { applyWorldEvent } from "@/game/core/rules/worldEvents";
import type {
  ApplyResult,
  PlayerAction,
  PlayerActionType,
  RivalPower,
  RunState,
  Seat,
  SiteId,
} from "@/game/core/types";
import { InvalidActionError } from "@/game/core/types";

/**
 * The actions that spend the turn. A company plays them in rounds
 * (`applyRound`), one per human, so `applyAction` refuses them there; the
 * others are free and apply at once, as in solo.
 */
export const TURN_ACTIONS: ReadonlySet<PlayerActionType> = new Set<PlayerActionType>([
  "commit",
  "review",
  "rest",
  "merge",
  "resume",
  "hack",
  "resolve_conflict",
]);

/**
 * The one entry point into the rules.
 *
 * Pure and total: it copies the state, never touches the caller's, consumes
 * randomness only through the cursor carried in that copy, and either returns a
 * new state or throws `InvalidActionError`. That is what lets the server replay
 * a submitted action log and get the byte-identical game the player played.
 *
 * Which actions cost a turn is a design decision, not an implementation one:
 * committing, reviewing and merging end the turn, and so does fixing a
 * refused ticket; starting a ticket, switching to one, submitting one and
 * spending skill points do not. A submit that is accepted hands its turn to
 * the merge that follows, a refusal hands it to its answer, and a merge
 * conflict defers it again to the choice that resolves it, so one review
 * never costs two turns.
 *
 * In a company only the free actions come through here, for the seat that
 * took them; the turn actions of every seat are resolved together by
 * `applyRound`.
 */
export function applyAction(
  state: RunState,
  action: PlayerAction,
  seat: Seat = SOLO_SEAT,
): ApplyResult {
  if (state.phase.kind === "game_over") {
    throw new InvalidActionError("The run is over");
  }
  const crew = isCrew(state);
  if (crew && TURN_ACTIONS.has(action.type)) {
    throw new InvalidActionError(`${action.type} is a turn action: a company plays it in a round`);
  }
  if (!isActionAvailable(state, seat, action)) {
    throw new InvalidActionError(
      `${action.type} is not available during phase ${phaseOf(state, seat).kind}`,
    );
  }

  const draft = structuredClone(state);
  const context = createContext(draft, seat);
  const wasCrunch = actorOf(context).energy <= BALANCE.energy.crunchThreshold;

  const consumesTurn = dispatch(context, action);

  if (!crew) {
    if (consumesTurn && !isOver(context)) endTurn(context);

    // Nothing in hand and nothing to start while the team still works: the
    // turns pass on their own, as free rests, until the sprint closes or a
    // ticket comes back to you (a hotfix, a departure). Bounded by the sprint's
    // box: its end enters the bonus choice or opens a board with tickets on it.
    while (
      !isOver(context) &&
      draft.phase.kind === "choose_action" &&
      !boardIsEmpty(draft) &&
      nothingToDo(draft, SOLO_SEAT)
    ) {
      passTurn(context);
      endTurn(context);
    }

    // Everything delivered and nothing waiting: the sprint has no reason to run
    // its clock down, so the release ships now. The player never sees a panel
    // with nothing on it.
    if (!isOver(context) && draft.phase.kind === "choose_action" && boardIsEmpty(draft)) {
      endSprint(context);
    }
  }

  reportCrunch(context, wasCrunch);
  appendLog(draft, context.events);
  // A run that never ends cannot keep everything it wrote.
  if (draft.showcase !== null) forgetOldHistory(draft);

  return { state: draft, events: context.events };
}

/** What a seat did with its round. `skipped`: it chose something an earlier seat made illegal. */
export type SeatOutcome = "acted" | "skipped" | "missed" | "passed";

/** The turn action of every seat (or `"missed"`), and what the world brings this round. */
export interface RoundInput {
  actions: Readonly<Record<Seat, PlayerAction | "missed">>;
  world: { rivals: readonly RivalPower[]; event?: WorldEventId };
}

export interface RoundResult extends ApplyResult {
  outcomes: Record<Seat, SeatOutcome>;
}

/**
 * One round of a company: the world moves, each seat plays its turn action in
 * seat order, then the clock advances exactly one turn. Seat order is the
 * tie-break of simultaneous play: an earlier seat's merge can make a later
 * seat's choice illegal, and that choice is then skipped without penalty.
 *
 * A seat that sent nothing is `"missed"`: a rest that gives nothing back and
 * costs the company patience, unless it had nothing to do anyway, in which
 * case the turn simply passes.
 */
export function applyRound(state: RunState, round: RoundInput): RoundResult {
  if (state.crew === undefined) throw new InvalidActionError("Rounds are for companies");
  if (state.phase.kind === "game_over") throw new InvalidActionError("The run is over");
  if (state.phase.kind !== "choose_action") {
    throw new InvalidActionError(
      `The company is deciding (${state.phase.kind}): answer before the next round`,
    );
  }

  const draft = structuredClone(state);
  const context = createContext(draft, null);
  draft.market.rivals = [...round.world.rivals];
  if (round.world.event !== undefined) applyWorldEvent(context, round.world.event);

  const outcomes: Record<Seat, SeatOutcome> = {};
  const crunching = new Map<Seat, boolean>();
  for (const seat of occupiedSeats(draft)) {
    crunching.set(seat, playerOf(draft, seat).energy <= BALANCE.energy.crunchThreshold);
  }

  for (const seat of occupiedSeats(draft)) {
    if (isOver(context)) break;
    context.seat = seat;
    const entry = round.actions[seat] ?? "missed";

    if (entry === "missed") {
      if (nothingToDo(draft, seat) && phaseOf(draft, seat).kind === "choose_action") {
        passTurn(context);
        emit(context, { type: "seat_passed", seat });
        outcomes[seat] = "passed";
      } else {
        missRound(context, seat);
        outcomes[seat] = "missed";
      }
      continue;
    }

    if (!TURN_ACTIONS.has(entry.type) || !isActionAvailable(draft, seat, entry)) {
      outcomes[seat] = "skipped";
      continue;
    }
    dispatch(context, entry);
    outcomes[seat] = "acted";
  }
  context.seat = null;

  if (!isOver(context)) endTurn(context);

  // The release ships as soon as nothing is left on the board.
  if (!isOver(context) && draft.phase.kind === "choose_action" && boardIsEmpty(draft)) {
    endSprint(context);
  }

  for (const [seat, was] of crunching) {
    if (draft.crew?.seats[seat] === undefined) continue;
    context.seat = seat;
    reportCrunch(context, was);
  }
  context.seat = null;

  appendLog(draft, context.events);
  forgetOldHistory(draft);
  return { state: draft, events: context.events, outcomes };
}

/** A human takes a seat. The only thing that changes the company's roster from outside. */
export function joinCrew(state: RunState, member: { name: string; site: SiteId }): ApplyResult {
  if (state.crew === undefined) throw new InvalidActionError("Only a company has seats");
  if (state.phase.kind === "game_over") throw new InvalidActionError("The run is over");
  const draft = structuredClone(state);
  const context = createContext(draft, null);
  try {
    joinSeat(context, member.name, member.site);
  } catch (error) {
    throw new InvalidActionError(error instanceof Error ? error.message : "Cannot join");
  }
  appendLog(draft, context.events);
  return { state: draft, events: context.events };
}

/** A human leaves their seat, for good: their work goes to the others. */
export function leaveCrew(state: RunState, seat: Seat): ApplyResult {
  if (state.crew?.seats[seat] === undefined) throw new InvalidActionError(`Seat ${seat} is vacant`);
  const draft = structuredClone(state);
  const context = createContext(draft, null);
  leaveSeat(context, seat, "left");
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
      state.stats.commitsTried[action.mode] += 1;
      performCommit(context, action.mode, action.kind);
      return true;

    case "review":
      performReview(context, false);
      return true;

    case "rest":
      performRest(context);
      return true;

    case "submit":
      performSubmit(context);
      return false;

    case "merge":
      performMerge(context);
      return state.phase.kind !== "resolve_conflict";

    // The refusal's turn is paid by its answer, so the sprint cannot close
    // between the two and leave the question behind: fixing writes the first
    // fix now and pays with its turn, shipping anyway pays at the merge.
    case "resume":
      resumeTicket(context);
      state.stats.commitsTried.craft += 1;
      performCommit(context, "craft", "fix");
      return true;

    case "followup":
      followupTicket(context);
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
      chooseRelic(context, action.relicId);
      startNextSprint(context);
      return false;

    case "dev_set":
      applyDevValues(context, action.values);
      return false;
  }
}

function endTurn(context: RuleContext): void {
  const { state } = context;

  applyDebtDecay(context);
  forEachSeat(context, () => runFreeReview(context, freeReviewCadence(context.effects)));
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
  if (state.sprintTurn % monthTurns() === 0 && state.sprintTurn < sprintTurns(state)) {
    closeMonth(context);
    if (isOver(context)) return;
    maybeNarrative(context, "payday");
  }
  if (isOver(context)) return;

  // The box runs out before the burnout check: a player at zero for two turns
  // is saved by the release that ships this turn, not executed just before.
  if (state.sprintTurn >= sprintTurns(state)) endSprint(context);
  if (isOver(context)) return;

  const burned = burnedOut(context);
  if (state.crew === undefined) {
    if (burned.length > 0) gameOver(context, "burnout");
    return;
  }
  // A company loses the human, not the run: their work goes to the others.
  for (const seat of burned) {
    if (isOver(context)) return;
    leaveSeat(context, seat, "burnout");
  }
}
