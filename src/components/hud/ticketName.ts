import type { TicketView } from "@/game";

/**
 * What a ticket is called on a card: its feature name when it has one, the
 * kind otherwise (a hotfix is a hotfix). Takes the `game` translator so the
 * caller keeps its one hook.
 */
export function ticketName(
  game: (key: never, params?: never) => string,
  ticket: Pick<TicketView, "kind" | "nameKey">,
): string {
  return ticket.nameKey === undefined
    ? game(`tickets.${ticket.kind}.name` as never)
    : game(ticket.nameKey as never);
}
