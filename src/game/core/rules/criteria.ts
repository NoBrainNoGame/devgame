import { BALANCE } from "@/game/core/balance";
import type { CriterionKind, NodeId, RunState, Ticket } from "@/game/core/types";

/**
 * Whether a ticket may merge.
 *
 * A criterion is never stored as satisfied: it is read off the ticket's own
 * commits and the run's state every time it is asked. That is what makes a
 * ticket that says "reviewed" honest — the merge button appears the moment the
 * last unread commit is read, and goes away again the moment the machine
 * writes another.
 */

export interface CriterionStatus {
  kind: CriterionKind;
  met: boolean;
}

/** Machine-written commits on the ticket nobody has read, oldest first. */
export function unreadAiOn(state: RunState, ticket: Ticket): NodeId[] {
  return ticket.nodeIds.filter((id) => {
    const commit = state.nodes[id]?.commit;
    return commit !== undefined && commit.mode === "ai" && !commit.reviewed;
  });
}

export function isCriterionMet(state: RunState, ticket: Ticket, kind: CriterionKind): boolean {
  switch (kind) {
    case "reviewed":
      return unreadAiOn(state, ticket).length === 0;
    case "documented":
      return ticket.nodeIds.some((id) => state.nodes[id]?.kind === "docs");
    case "refactored":
      return ticket.nodeIds.some((id) => state.nodes[id]?.kind === "refactor");
    case "clean":
      return state.debt <= BALANCE.criteria.cleanDebtMax;
  }
}

export function criteriaStatus(state: RunState, ticket: Ticket): CriterionStatus[] {
  return ticket.criteria.map((kind) => ({ kind, met: isCriterionMet(state, ticket, kind) }));
}

/** Points full and every criterion holding. The one condition of a merge. */
export function isReady(state: RunState, ticket: Ticket): boolean {
  if (ticket.filled < ticket.points) return false;
  return ticket.criteria.every((kind) => isCriterionMet(state, ticket, kind));
}
