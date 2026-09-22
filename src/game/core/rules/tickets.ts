import { BALANCE } from "@/game/core/balance";
import { pickFeatureLane, ticketSerial } from "@/game/core/map/layout";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { raiseQuality } from "@/game/core/rules/quality";
import type { DetourKind, NodeId, RunState, Ticket, TicketId } from "@/game/core/types";

/**
 * The board: what is waiting, what is open, and which one is being written.
 *
 * Opening a ticket is free and so is switching between open ones — the cost of
 * holding several is paid on every commit instead, see `wipExtra`. What is not
 * free is leaving a ticket in the backlog: after a sprint of grace the board
 * assigns it to you, open or not, and that is how the work piles up.
 */

/** Every ticket, oldest first. Serial order, never lexical. */
export function sortedTickets(state: RunState): Ticket[] {
  return Object.keys(state.tickets)
    .sort((a, b) => ticketSerial(a) - ticketSerial(b))
    .map((id) => state.tickets[id])
    .filter((ticket): ticket is Ticket => ticket !== undefined);
}

export function openTickets(state: RunState): Ticket[] {
  return sortedTickets(state).filter((ticket) => ticket.status === "open");
}

export function backlogTickets(state: RunState): Ticket[] {
  return sortedTickets(state).filter((ticket) => ticket.status === "backlog");
}

export function currentTicket(state: RunState): Ticket | null {
  const id = state.player.ticketId;
  if (id === null) return null;
  const ticket = state.tickets[id];
  return ticket === undefined || ticket.status !== "open" ? null : ticket;
}

export function getTicket(state: RunState, id: TicketId): Ticket {
  const ticket = state.tickets[id];
  if (ticket === undefined) throw new Error(`Unknown ticket ${id}`);
  return ticket;
}

/** Machine-written commits on the ticket nobody has read, oldest first. */
export function unreadAiOn(state: RunState, ticket: Ticket): NodeId[] {
  return ticket.nodeIds.filter((id) => {
    const commit = state.nodes[id]?.commit;
    return commit !== undefined && commit.mode === "ai" && !commit.reviewed;
  });
}

/** Commits on the ticket the review flagged, oldest first. */
export function buggedOn(state: RunState, ticket: Ticket): NodeId[] {
  return ticket.nodeIds.filter((id) => state.nodes[id]?.commit.bugged === true);
}

/** The commit on the ticket that cost the codebase the most, if any did. */
export function mostIndebtedOn(state: RunState, ticket: Ticket): NodeId | null {
  let best: NodeId | null = null;
  let most = 0;
  for (const id of ticket.nodeIds) {
    const cost = state.nodes[id]?.commit.debt ?? 0;
    if (cost > most) {
      best = id;
      most = cost;
    }
  }
  return best;
}

/** Points full and no bug left standing: the ticket may go to review. */
export function isReady(state: RunState, ticket: Ticket): boolean {
  return ticket.filled >= ticket.points && buggedOn(state, ticket).length === 0;
}

export function isOnHotfix(state: RunState): boolean {
  return currentTicket(state)?.mustWrite === "hotfix";
}

/** Merges landed on `dev` since this ticket was opened. */
export function behindOf(state: RunState, ticket: Ticket): number {
  return Math.max(0, state.devMerges - ticket.devMergesAtOpen);
}

/**
 * The ways a commit on this ticket may be written, beyond plainly.
 *
 * One source of truth: the actions, the previews and the commit rule all ask
 * here. A hotfix or a forced refactor offers nothing — it is one kind of
 * commit until it is done. The situational ones each need a target: a squash
 * needs something to squash, a rebase needs `dev` to have moved, a fix needs
 * a commit the review flagged, and a refactor needs a commit that cost debt.
 * A refactor of nothing is a commit with a nicer name.
 */
export function offersOf(state: RunState, ticket: Ticket): DetourKind[] {
  if (ticket.mustWrite !== undefined) return [];

  const offers: DetourKind[] = ["docs", "risky"];
  if (buggedOn(state, ticket).length > 0) offers.push("fix");
  if (mostIndebtedOn(state, ticket) !== null) offers.push("refactor");
  if (unreadAiOn(state, ticket).length >= BALANCE.squash.minUnread) offers.push("squash");
  if (behindOf(state, ticket) > 0) offers.push("rebase");
  return offers.sort();
}

export function startTicket(context: RuleContext, ticketId: TicketId): void {
  openTicket(context, getTicket(context.state, ticketId), false);
}

export function checkoutTicket(context: RuleContext, ticketId: TicketId): void {
  context.state.player.ticketId = ticketId;
  emit(context, { type: "checkout", ticketId });
}

/**
 * Work the board opens on your behalf: a hotfix after an incident, a refactor
 * after the debt explodes. It is open from birth, and it is yours whether you
 * were between tickets or not.
 */
export function forceTicket(
  context: RuleContext,
  kind: "hotfix" | "refactor",
  points: number,
): Ticket {
  const { state } = context;
  const id: TicketId = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;

  const ticket: Ticket = {
    id,
    kind,
    status: "backlog",
    points,
    filled: 0,
    rework: 0,
    debtAdded: 0,
    rejections: 0,
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
    mustWrite: kind,
  };
  state.tickets[id] = ticket;

  openTicket(context, ticket, true);
  return ticket;
}

/** Tickets left in the backlog past their grace are opened for you. */
export function assignStaleTickets(context: RuleContext): void {
  const { state } = context;
  const cutoff = state.sprint - BALANCE.tickets.graceSprints;

  // Every ticket the sprint has to force on you is one production noticed
  // waiting. Patience is spent before the ticket opens, so the log reads in
  // the order it happened: the complaint, then the assignment.
  for (const ticket of backlogTickets(state)) {
    if (ticket.sprintArrived >= cutoff) continue;
    state.sprintForced = true;
    raiseQuality(context, BALANCE.quality.perStaleTicket);
    if (state.phase.kind === "game_over") return;
    openTicket(context, ticket, true);
  }
}

export function openTicket(context: RuleContext, ticket: Ticket, forced: boolean): void {
  const { state } = context;
  if (ticket.status !== "backlog") return;

  ticket.status = "open";
  ticket.lane = pickFeatureLane(openTickets(state));
  ticket.devMergesAtOpen = state.devMerges;

  // Yours if you had nothing in hand. If you did, it waits: being pulled off
  // your feature by a production bug is a punishment the WIP malus already
  // delivers, and it would do it twice.
  if (state.player.ticketId === null) state.player.ticketId = ticket.id;

  emit(context, { type: "ticket_started", ticketId: ticket.id, kind: ticket.kind, forced });
}

/**
 * After a ticket closes, the oldest one still open is the one being written —
 * or nothing, and the panel offers the backlog.
 */
export function settleCurrent(context: RuleContext): void {
  const { state } = context;
  if (currentTicket(state) !== null) return;

  const next = openTickets(state)[0];
  state.player.ticketId = next === undefined ? null : next.id;
}
