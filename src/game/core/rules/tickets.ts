import { obstacleNameKey, TICKET_KIND } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
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

/** Open tickets that are yours: what the team holds is not on your desk. */
export function playerTickets(state: RunState): Ticket[] {
  return openTickets(state).filter((ticket) => ticket.assignee === undefined);
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

/** The obstacles standing on a ticket right now: open, forked off it, not yet landed back. */
export function obstaclesOf(state: RunState, ticket: Ticket): Ticket[] {
  return openTickets(state).filter((other) => other.parentId === ticket.id);
}

/** Every obstacle a ticket ever turned up, whatever became of it, oldest first. */
export function childrenOf(state: RunState, ticket: Ticket): Ticket[] {
  return sortedTickets(state).filter((other) => other.parentId === ticket.id);
}

/**
 * The ticket's commits and its obstacles', in ticket order. What a review
 * reads, what a fix redoes and what ships with the feature: an obstacle's
 * work is the feature's work, only its points are its own.
 */
export function treeNodeIds(state: RunState, ticket: Ticket): NodeId[] {
  return [...ticket.nodeIds, ...childrenOf(state, ticket).flatMap((child) => child.nodeIds)];
}

/** Machine-written commits on the ticket nobody has read, oldest first. */
export function unreadAiOn(state: RunState, ticket: Ticket): NodeId[] {
  return treeNodeIds(state, ticket).filter((id) => {
    const commit = state.nodes[id]?.commit;
    return commit !== undefined && commit.mode === "ai" && !commit.reviewed;
  });
}

/** Commits on the ticket the review flagged, oldest first. */
export function buggedOn(state: RunState, ticket: Ticket): NodeId[] {
  return treeNodeIds(state, ticket).filter((id) => state.nodes[id]?.commit.bugged === true);
}

/** The commit on the ticket that cost the codebase the most, if any did. */
export function mostIndebtedOn(state: RunState, ticket: Ticket): NodeId | null {
  let best: NodeId | null = null;
  let most = 0;
  for (const id of treeNodeIds(state, ticket)) {
    const cost = state.nodes[id]?.commit.debt ?? 0;
    if (cost > most) {
      best = id;
      most = cost;
    }
  }
  return best;
}

/**
 * Points full, no bug left standing, no obstacle in the way: the ticket may
 * go to review — or, for an obstacle, land back on its feature. A showcase
 * run is looked at, not played, and a flagged bug there holds nothing.
 */
export function isReady(state: RunState, ticket: Ticket): boolean {
  return (
    ticket.filled >= ticket.points &&
    (state.showcase !== null || buggedOn(state, ticket).length === 0) &&
    obstaclesOf(state, ticket).length === 0
  );
}

export function isOnHotfix(state: RunState): boolean {
  return currentTicket(state)?.mustWrite === "hotfix";
}

/** Merges landed on `dev` since this ticket was opened. An obstacle lands on its feature, not on `dev`: never behind. */
export function behindOf(state: RunState, ticket: Ticket): number {
  if (ticket.parentId !== undefined) return 0;
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
  // A forced ticket is one kind of commit until it is done — except a fix,
  // because a review can flag a hotfix's commit too, and a ticket that can
  // neither be fixed nor resubmitted is a run that cannot end.
  if (ticket.mustWrite !== undefined) {
    return buggedOn(state, ticket).length > 0 ? ["fix"] : [];
  }

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
    // Nothing is drawn here: a forced ticket earns nothing, and a draw that
    // depended on whether production broke would move every seed's stream.
    tier: state.tier,
    load: 0,
    mrr: 0,
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
    mustWrite: kind,
  };
  state.tickets[id] = ticket;

  openTicket(context, ticket, true);
  return ticket;
}

/**
 * A commit on a feature turned something up: a bug on the way, a piece
 * missing, a design that will not hold. The obstacle is born open and forked
 * off the feature, in the hand of whoever was writing it — yours if the
 * feature was, the developer's if it was theirs — and the feature cannot go
 * to review until the obstacle has landed back on it. Its points are its own
 * and worth nothing; the bugs on it are the feature's.
 */
export function spawnObstacle(context: RuleContext, parent: Ticket, nodeId: NodeId): Ticket {
  const { state, rng } = context;
  const { obstacle } = BALANCE.tickets.kinds;
  const id: TicketId = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;

  const ticket: Ticket = {
    id,
    kind: "obstacle",
    status: "open",
    points: rng.int(obstacle.points.min, obstacle.points.max),
    filled: 0,
    rework: 0,
    debtAdded: 0,
    rejections: 0,
    tier: state.tier,
    load: 0,
    mrr: 0,
    sprintArrived: state.sprint,
    devMergesAtOpen: state.devMerges,
    nodeIds: [],
    parentId: parent.id,
    nameKey: obstacleNameKey(fnv1a(`${state.seed}:${id}`)),
    ...(parent.assignee === undefined ? {} : { assignee: parent.assignee }),
  };
  state.tickets[id] = ticket;
  state.stats.arrivedByKind.obstacle += 1;
  // Started for whoever was writing: the feature's author is the obstacle's.
  if (state.player.ticketId === parent.id) state.player.ticketId = id;

  emit(context, {
    type: "obstacle_spawned",
    ticketId: id,
    parentId: parent.id,
    nodeId,
    nameKey: ticket.nameKey ?? "",
  });
  return ticket;
}

/**
 * Whether the commit just written turns an obstacle up. One at a time, a
 * cap per feature, only on the kinds of work that can hide one — and the
 * chance is rolled only then, so a feature that cannot have one draws
 * nothing.
 */
export function maybeSpawnObstacle(context: RuleContext, parent: Ticket, nodeId: NodeId): void {
  const { state, rng } = context;
  const { obstacle } = BALANCE.tickets.kinds;
  if (!TICKET_KIND[parent.kind].spawnsObstacles) return;
  if (obstaclesOf(state, parent).length > 0) return;
  if (childrenOf(state, parent).length >= obstacle.maxPerTicket) return;
  if (!rng.chance(obstacle.chancePct)) return;
  spawnObstacle(context, parent, nodeId);
}

/** Tickets left in the backlog past their grace are opened for you. */
export function assignStaleTickets(context: RuleContext): void {
  const { state } = context;
  // A showcase's board is fed for its team; what waits, waits for them.
  if (state.showcase !== null) return;
  const cutoff = state.sprint - BALANCE.tickets.graceSprints;

  // Every ticket the sprint has to force on you is one production noticed
  // waiting. Patience is spent before the ticket opens, so the log reads in
  // the order it happened: the complaint, then the assignment.
  for (const ticket of backlogTickets(state)) {
    if (ticket.sprintArrived >= cutoff) continue;
    // The codebase's own request is never forced on you: it waits.
    if (!TICKET_KIND[ticket.kind].forcedWhenStale) continue;
    state.sprintForced = true;
    state.stats.staleForced += 1;
    raiseQuality(context, BALANCE.quality.perStaleTicket, "stale");
    if (state.phase.kind === "game_over") return;
    openTicket(context, ticket, true);
  }
}

/**
 * The column a ticket writes in, taken by its first commit and not before:
 * a ticket that is open but unwritten holds no column, so the graph never
 * shows a gap where nothing happened, and a column freed by a merge goes to
 * the next ticket that actually forks. Handed back on merge and on restart.
 */
export function ensureLane(state: RunState, ticket: Ticket): number {
  if (ticket.lane === undefined) ticket.lane = pickFeatureLane(openTickets(state));
  return ticket.lane;
}

export function openTicket(context: RuleContext, ticket: Ticket, forced: boolean): void {
  const { state } = context;
  if (ticket.status !== "backlog") return;

  ticket.status = "open";
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

  const next = playerTickets(state)[0];
  state.player.ticketId = next === undefined ? null : next.id;
}
