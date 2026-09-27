import { BALANCE } from "@/game/core/balance";
import { arriveTicketOfKind } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { drawMergeEvent } from "@/game/core/rules/events";
import { mergeEventChance } from "@/game/core/rules/modifiers";
import { raiseQuality } from "@/game/core/rules/quality";
import {
  backlogTickets,
  buggedOn,
  currentTicket,
  getTicket,
  isReady,
  openTicket,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import { completeMerge, completeObstacle } from "@/game/core/rules/write";
import type { Ticket, TicketId } from "@/game/core/types";

/**
 * The pull request.
 *
 * A ticket with its points full is not delivered, it is submitted. Somebody
 * reads it, and what they find is exactly what the design punishes: every
 * machine-written commit nobody reviewed may be caught as a bug. A codebase
 * over its debt ceiling never gets this far — no pull request opens under the
 * health floor (`healthLetsOpen`), because that refusal would be certain,
 * and a certain refusal is a trap, not a risk. Accepted, the ticket
 * waits for the player to press merge — the verdict is read out first, and a
 * merge that lands before the button is pressed reads as the game playing
 * itself — and the merge costs the turn. Refused, it comes back with the bugs
 * to fix as extra points, the board hands you another ticket meanwhile,
 * because the sprint does not wait, and the answer pays the turn: fix it
 * here, or ship it with a follow-up ticket per bug and pay at the merge.
 */

export function performSubmit(context: RuleContext): void {
  const { state } = context;
  const ticket = currentTicket(state);
  if (ticket === null) throw new Error("performSubmit: no ticket in hand");

  const { acceptance } = BALANCE;
  const unread = unreadAiOn(state, ticket);

  // Every unread machine-written commit is read now; the ones that turn out
  // to hide a bug are flagged, and stay flagged until a refactor redoes them.
  // A showcase's reviewer reads nothing and refuses nothing: the run is a
  // picture, and a refusal would stop it.
  const caught: string[] = [];
  for (const id of unread) {
    if (state.showcase !== null) break;
    const hidden = state.nodes[id]?.commit.hiddenBug === true;
    if (hidden || context.rng.chance(acceptance.bugDetectPct)) caught.push(id);
  }
  const bugs = caught.length;
  const accepted = bugs === 0;
  const rework = bugs * acceptance.pointsPerBug;

  emit(context, {
    type: "pr_reviewed",
    ticketId: ticket.id,
    accepted,
    bugs,
    unread: unread.length,
    rework,
  });

  if (accepted) {
    state.phase = { kind: "pr_accepted", ticketId: ticket.id };
    return;
  }

  for (const id of unread) {
    const node = state.nodes[id];
    if (node !== undefined) node.commit.reviewed = true;
  }
  for (const id of caught) {
    const node = state.nodes[id];
    if (node !== undefined) node.commit.bugged = true;
  }
  ticket.rejections += 1;
  state.stats.rejections += 1;
  // A blameless culture takes the refusal without a mark against you.
  if (!context.effects.blamelessRejection) {
    raiseQuality(context, BALANCE.quality.perRejection, "rejection");
  }
  // The refusal that fills the gauge is the sack, not a rejection to answer.
  if (state.phase.kind === "game_over") return;
  ticket.rework += rework;
  ticket.points += rework;
  ticket.filled = Math.min(ticket.filled, ticket.points);

  // The sprint does not wait for a rewrite: the next ticket in the backlog
  // opens beside this one, whatever the player decides next. Nothing waiting
  // means nothing opens — the pressure is what the sprint had planned, not a
  // ticket invented to punish, so a run cannot spiral past its own backlog.
  const extra = backlogTickets(state)[0];
  if (extra !== undefined) openTicket(context, extra, true);

  state.phase = { kind: "ticket_rejected", ticketId: ticket.id, bugs };
}

/**
 * Landing an accepted ticket. One roll decides whether anything happens on
 * the way in; the merge-event table decides what. A conflict is the only
 * outcome that stops the merge, and everything else costs something and lands.
 */
export function performMerge(context: RuleContext): void {
  const { state } = context;
  if (state.phase.kind === "pr_accepted") {
    land(context, getTicket(state, state.phase.ticketId));
    return;
  }
  // An obstacle needs no review: full, it lands back on its feature.
  const ticket = currentTicket(state);
  if (ticket !== null && ticket.parentId !== undefined && isReady(state, ticket)) {
    completeObstacle(context, ticket);
    return;
  }
  throw new Error("performMerge: nothing was accepted");
}

function land(context: RuleContext, ticket: Ticket): void {
  const { state } = context;

  let noRegen = false;
  if (context.rng.chance(mergeEventChance(state, ticket))) {
    const event = drawMergeEvent(context);
    if (event.outcome === "conflict") {
      state.phase = { kind: "resolve_conflict", source: "merge", ticketId: ticket.id };
      emit(context, { type: "conflict", ticketId: ticket.id });
      return;
    }
    noRegen = event.noRegen;
  }

  completeMerge(context, ticket, { noRegen });
  state.phase = { kind: "choose_action" };
}

/**
 * Ship it anyway. The commits the review flagged go to production as they
 * are, and each gets a follow-up ticket in the backlog, dated like a
 * customer's bug: land it and the bug is out before the release rolls on
 * it, miss it and production remembers. The fix points come off again — the
 * work is somebody else's now — and the pull request stands accepted, its
 * merge the next move.
 */
export function followupTicket(context: RuleContext): void {
  const { state } = context;
  const phase = state.phase;
  if (phase.kind !== "ticket_rejected") throw new Error("followupTicket: nothing was rejected");

  const ticket = getTicket(state, phase.ticketId);
  ticket.points -= ticket.rework;
  ticket.rework = 0;
  ticket.filled = Math.min(ticket.filled, ticket.points);

  const ticketIds: TicketId[] = [];
  for (const nodeId of buggedOn(state, ticket)) {
    const followup = arriveTicketOfKind(context, "client_bug");
    followup.fixesNodeId = nodeId;
    ticketIds.push(followup.id);
  }
  state.stats.followups += ticketIds.length;
  emit(context, { type: "followup", ticketId: ticket.id, bugs: ticketIds.length, ticketIds });
  state.phase = { kind: "pr_accepted", ticketId: ticket.id };
}

/** Keep the commits and fix what was found: the reducer writes the first fix at once. */
export function resumeTicket(context: RuleContext): void {
  const { state } = context;
  if (state.phase.kind !== "ticket_rejected") throw new Error("resumeTicket: nothing was rejected");
  state.phase = { kind: "choose_action" };
}
