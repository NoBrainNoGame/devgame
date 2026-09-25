import type { RunSnapshot } from "@/game";

/**
 * Whether the player is working on this ticket: holding it, or holding a sub
 * it turned up — an obstacle is the feature's own work, done on the way to
 * it, so a VIP waiting on its obstacle is not a VIP nobody is working on.
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
