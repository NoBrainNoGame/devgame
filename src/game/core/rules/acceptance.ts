import { BALANCE } from "@/game/core/balance";
import { arriveTicket } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { drawMergeEvent } from "@/game/core/rules/events";
import { mergeEventChance } from "@/game/core/rules/modifiers";
import { availableSkills } from "@/game/core/rules/sprint";
import { currentTicket, getTicket, openTicket, unreadAiOn } from "@/game/core/rules/tickets";
import { completeMerge, discardCommits } from "@/game/core/rules/write";
import type { Ticket } from "@/game/core/types";

/**
 * The pull request.
 *
 * A ticket with its points full is not delivered, it is submitted. Somebody
 * reads it, and what they find is exactly what the design punishes: every
 * machine-written commit nobody reviewed may be caught as a bug, and a
 * codebase over its debt ceiling takes nothing more. Accepted, the ticket
 * lands in the same turn. Refused, it comes back with the bugs to fix as
 * extra points — and the board hands you another ticket meanwhile, because
 * the sprint does not wait.
 */

export function performSubmit(context: RuleContext): void {
  const { state } = context;
  const ticket = currentTicket(state);
  if (ticket === null) throw new Error("performSubmit: no ticket in hand");

  const { acceptance } = BALANCE;
  const unread = unreadAiOn(state, ticket);

  // Every unread machine-written commit is read now; the ones that turn out
  // to hide a bug are flagged, and stay flagged until a refactor redoes them.
  const caught: string[] = [];
  for (const id of unread) {
    const hidden = state.nodes[id]?.commit.hiddenBug === true;
    if (hidden || context.rng.chance(acceptance.bugDetectPct)) caught.push(id);
  }
  const bugs = caught.length;
  const overDebt = state.debt > acceptance.maxDebt;
  const accepted = bugs === 0 && !overDebt;
  const rework = accepted ? 0 : bugs * acceptance.pointsPerBug;

  emit(context, {
    type: "pr_reviewed",
    ticketId: ticket.id,
    accepted,
    bugs,
    unread: unread.length,
    debt: state.debt,
    maxDebt: acceptance.maxDebt,
    rework,
  });

  if (accepted) {
    land(context, ticket);
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
  ticket.rework += rework;
  ticket.points += rework;
  ticket.filled = Math.min(ticket.filled, ticket.points);

  // The sprint does not wait for a rewrite: a new ticket arrives and opens
  // beside this one, whatever the player decides next.
  const extra = arriveTicket(context, availableSkills(state), false);
  openTicket(context, extra, true);

  state.phase = { kind: "ticket_rejected", ticketId: ticket.id, bugs, overDebt };
}

/**
 * Landing an accepted ticket. One roll decides whether anything happens on
 * the way in; the merge-event table decides what. A conflict is the only
 * outcome that stops the merge, and everything else costs something and lands.
 */
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

/** `git reset --hard`: the commits go, the ticket starts from today's `dev`. */
export function restartTicket(context: RuleContext): void {
  const { state } = context;
  const phase = state.phase;
  if (phase.kind !== "ticket_rejected") throw new Error("restartTicket: nothing was rejected");

  const ticket = getTicket(state, phase.ticketId);
  const dropped = discardCommits(context, ticket);

  ticket.points -= ticket.rework;
  ticket.rework = 0;
  ticket.filled = 0;
  ticket.debtAdded = 0;
  ticket.devMergesAtOpen = state.devMerges;

  emit(context, { type: "ticket_restarted", ticketId: ticket.id, nodeIds: dropped });
  state.phase = { kind: "choose_action" };
}

/** Keep the commits, fix what was found. The rework is already on the ticket. */
export function resumeTicket(context: RuleContext): void {
  const { state } = context;
  if (state.phase.kind !== "ticket_rejected") throw new Error("resumeTicket: nothing was rejected");
  state.phase = { kind: "choose_action" };
}
