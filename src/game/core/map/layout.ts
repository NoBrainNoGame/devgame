import type { NodeId, Ticket, TicketId } from "@/game/core/types";

/**
 * Which column each node is drawn in.
 *
 * This is `git log --graph` logic, with the two long-lived branches pinned:
 * `main` holds lane 0 and `dev` holds lane 1. A ticket takes the leftmost free
 * column to the right of `dev` when it is opened, and hands it back when it
 * merges. Rows are global — every commit written takes the next one — so two
 * tickets never share a spot and the graph reads in the order it was written.
 *
 * It lives in `core` rather than in the renderer because the tests assert on
 * it and because two tickets sharing a column is a rules bug, not a drawing
 * one.
 */

/** `main`: nothing but the sprint merge and the release it ships. */
export const MAIN_LANE = 0;
/** `dev`: where every ticket is integrated. */
export const DEV_LANE = 1;
/** The first column a ticket may take. */
export const FIRST_FEATURE_LANE = 2;

/** Numeric part of `${sprint}:${serial}`. Serials are globally increasing. */
export function nodeSerial(id: NodeId): number {
  const colon = id.indexOf(":");
  return colon === -1 ? 0 : Number(id.slice(colon + 1));
}

export function nodeSprint(id: NodeId): number {
  const colon = id.indexOf(":");
  return colon === -1 ? 0 : Number(id.slice(0, colon));
}

/**
 * Numeric part of `t${serial}`.
 *
 * Every place that orders tickets goes through this. A lexical sort puts `t10`
 * before `t2`, and "the oldest open ticket" would then change meaning the
 * moment a run reached ten of them — silently, and differently on replay.
 */
export function ticketSerial(id: TicketId): number {
  return Number(id.slice(1));
}

/** The leftmost column no open ticket is using. */
export function pickFeatureLane(open: readonly Pick<Ticket, "lane">[]): number {
  const taken = new Set<number>();
  for (const ticket of open) {
    if (ticket.lane !== undefined) taken.add(ticket.lane);
  }

  let lane = FIRST_FEATURE_LANE;
  while (taken.has(lane)) lane += 1;
  return lane;
}
