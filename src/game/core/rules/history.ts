import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { RunState, TicketId } from "@/game/core/types";

/**
 * Forgetting, for a run that never ends.
 *
 * A showcase runs for as long as the page is open, and every node it wrote
 * would otherwise stay in the state — and be cloned again with every action,
 * and drawn again with every rebuild. So a showcase keeps a window of rows
 * behind the head and lets the rest go: the commits below it, the merged
 * tickets they belonged to. Nothing a rule still reads is touched: the
 * tickets still open, what the release has yet to judge, and the trunks'
 * tips, which the next sprint forks from. A played run forgets nothing —
 * its log is its score.
 */

/** Rows kept behind the head. Presentation, not balance: a showcase is never scored. */
export const SHOWCASE_KEEP_ROWS = 300;

export function forgetOldHistory(state: RunState): void {
  const horizon = state.nextDepth - SHOWCASE_KEEP_ROWS;
  if (horizon <= 0) return;

  const keep = new Set<string>(state.shipped);
  const openTickets = new Set<TicketId>();
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.status === "open") openTickets.add(ticket.id);
  }
  // The trunks' newest commits stay whatever their row: the next sprint is
  // written on top of them.
  let mainTip: string | null = null;
  let devTip: string | null = null;
  let mainDepth = -1;
  let devDepth = -1;
  for (const node of Object.values(state.nodes)) {
    if (node.lane === MAIN_LANE && node.depth > mainDepth) {
      mainDepth = node.depth;
      mainTip = node.id;
    }
    if (node.lane === DEV_LANE && node.depth > devDepth) {
      devDepth = node.depth;
      devTip = node.id;
    }
  }
  if (mainTip !== null) keep.add(mainTip);
  if (devTip !== null) keep.add(devTip);

  const dropped = new Set<string>();
  for (const node of Object.values(state.nodes)) {
    if (node.depth >= horizon || keep.has(node.id)) continue;
    if (node.ticketId !== undefined && openTickets.has(node.ticketId)) continue;
    dropped.add(node.id);
    delete state.nodes[node.id];
  }
  if (dropped.size === 0) return;

  // A merged ticket whose every commit is gone is gone too; one that still
  // has a commit on screen keeps only those.
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.status === "open" || ticket.status === "backlog") continue;
    ticket.nodeIds = ticket.nodeIds.filter((id) => !dropped.has(id));
    if (ticket.mergeNodeId !== undefined && dropped.has(ticket.mergeNodeId)) {
      delete ticket.mergeNodeId;
    }
    if (ticket.nodeIds.length === 0 && ticket.mergeNodeId === undefined) {
      delete state.tickets[ticket.id];
    }
  }
}
