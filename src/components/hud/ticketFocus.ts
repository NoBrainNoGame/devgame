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
 * The tabs that blink: every urgent ticket that is not merely waiting on its
 * obstacle (the obstacle blinks instead) and that nobody is on. While the
 * player answers one urgent ticket — holding it or one of its subs — the
 * others hold still: two VIPs at once, one in hand, and the other blinking
 * would only repeat what the player chose to put second. The one in hand
 * still points at its own obstacle when that is all it waits on.
 */
export function blinkingTabs(
  snapshot: Parameters<typeof workingOn>[0],
  tickets: readonly FocusTicket[],
): Map<string, Urgency> {
  const urgent = urgencies(tickets);
  // The urgent ticket an obstacle serves, up the chain: the one it belongs to.
  const rootOf = (id: string): string => {
    let at = id;
    for (let hops = 0; hops <= tickets.length; hops += 1) {
      const urgency = urgent.get(at);
      if (urgency?.reason !== "obstacle") return at;
      at = urgency.parentId;
    }
    return at;
  };
  const answering = new Set([...urgent.keys()].filter((id) => workingOn(snapshot, id)).map(rootOf));

  const blinking = new Map<string, Urgency>();
  for (const ticket of tickets) {
    const urgency = urgent.get(ticket.id);
    if (urgency === undefined || ticket.waitingOnObstacle) continue;
    if (workingOn(snapshot, ticket.id)) continue;
    if (answering.size > 0 && !answering.has(rootOf(ticket.id))) continue;
    blinking.set(ticket.id, urgency);
  }
  return blinking;
}
