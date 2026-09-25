import type { RunSnapshot } from "@/game";

/**
 * Which of the player's tickets ask for them, and whether one is being
 * answered. Working on a ticket is holding it, or holding a sub it turned up —
 * an obstacle is the feature's own work, done on the way to it, so a VIP
 * waiting on its obstacle is not a VIP nobody is working on.
 */
export function workingOn(
  snapshot: Pick<RunSnapshot, "tickets"> & { player: { ticketId: string | null } },
  id: string,
): boolean {
  let at = snapshot.player.ticketId;
  // Bounded by the ticket count: a malformed parent chain cannot loop.
  for (let hops = 0; at !== null && hops <= snapshot.tickets.length; hops += 1) {
    if (at === id) return true;
    const held = snapshot.tickets.find((ticket) => ticket.id === at);
    at = held?.parentId ?? null;
  }
  return false;
}

/** What a ticket's tab needs from it to tell whether it asks for the player. */
export interface FocusTicket {
  id: string;
  kind: string;
  deadlineSprint?: number | undefined;
  blockedBy: readonly string[];
  waitingOnObstacle: boolean;
}

/** Why a ticket asks for the player. */
export type Urgency =
  | { reason: "vip" }
  | { reason: "deadline"; sprint: number }
  /** The only thing left between `parentId`, itself urgent, and its merge. */
  | { reason: "obstacle"; parentId: string };

/**
 * The tickets that ask for the player when nobody is on them: a VIP, a ticket
 * with a deadline — and, once such a ticket has nothing left but its
 * obstacle, the obstacle in its stead, since that is where the work is now.
 * An obstacle's own obstacle inherits the same way.
 */
export function urgencies(tickets: readonly FocusTicket[]): Map<string, Urgency> {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const found = new Map<string, Urgency>();
  const visit = (ticket: FocusTicket, urgency: Urgency): void => {
    if (found.has(ticket.id)) return;
    found.set(ticket.id, urgency);
    if (!ticket.waitingOnObstacle) return;
    for (const id of ticket.blockedBy) {
      const sub = byId.get(id);
      if (sub !== undefined) visit(sub, { reason: "obstacle", parentId: ticket.id });
    }
  };
  for (const ticket of tickets) {
    if (ticket.kind === "vip") visit(ticket, { reason: "vip" });
    else if (ticket.deadlineSprint !== undefined) {
      visit(ticket, { reason: "deadline", sprint: ticket.deadlineSprint });
    }
  }
  return found;
}

/**
 * Whether a tab blinks: it asks for the player, it is not merely waiting on
 * its obstacle (the obstacle blinks instead), and nobody is on it or on any
 * of its subs.
 */
export function blinks(
  snapshot: Parameters<typeof workingOn>[0],
  ticket: FocusTicket,
  urgency: Urgency | undefined,
): boolean {
  return urgency !== undefined && !ticket.waitingOnObstacle && !workingOn(snapshot, ticket.id);
}
