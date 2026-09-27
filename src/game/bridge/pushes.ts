import { FIRST_FEATURE_LANE } from "@/game/core/map/layout";
import type { GameEvent, MapNode, NodeId, RunState, TicketId } from "@/game/core/types";

/**
 * Which of your commits are pushed, and which are still only on your machine.
 *
 * A commit you write is local first: its cost, its points and whatever it
 * broke all land on it while it is still yours. If its roll went through, it
 * is pushed at the end of its story. If it missed, the commit is broken and
 * stays local until its branch is pushed again, and a push keeps only the
 * code that worked: squashed into the next commit that goes through, or —
 * when the pull request, a merge or an obstacle landing pushes the branch
 * with nothing new — folded back into the last commit that did.
 *
 * The rule is the engine's (`pushBranch`): a broken commit counts for nothing
 * and leaves its ticket at the push. Where it goes on screen is decided here,
 * folded from events batch after batch and rebuilt by replaying the log on
 * load, exactly as the state itself is.
 */

export interface PushLedger {
  /** Commits written but not pushed, per branch, oldest first. */
  readonly local: Readonly<Record<TicketId, readonly NodeId[]>>;
  /** A commit squashed into a later one when they were pushed together. */
  readonly absorbed: Readonly<Record<NodeId, NodeId>>;
}

/** Commits pushed together. */
export interface PushOp {
  /** The broken commits dropped, oldest first, then `into`. */
  readonly nodeIds: readonly NodeId[];
  /**
   * The commit that stays: the one that went through, or for a `flush` the
   * last one that had, below the broken ones it takes back.
   */
  readonly into: NodeId;
  /** Index of the event that pushed them. */
  readonly at: number;
  /**
   * `commit`: a commit that went through, pushed once its own story is told.
   * `flush`: a pull request or a merge, which needs the branch on the remote
   * before it can happen.
   */
  readonly kind: "commit" | "flush";
}

export function emptyPushes(): PushLedger {
  return { local: {}, absorbed: {} };
}

/**
 * Whether a commit starts on your machine. Only your own work does: the
 * trunks and every merge happen on the remote, and a colleague's commit
 * reaches the graph already pushed.
 */
export function isBornLocal(node: MapNode): boolean {
  return (
    node.lane >= FIRST_FEATURE_LANE &&
    node.ticketId !== undefined &&
    node.commit.author === undefined &&
    node.kind !== "obstacle_merge"
  );
}

/** Commits squashed into this one, itself included; 1 for an ordinary commit. */
export function squashedInto(ledger: PushLedger, id: NodeId): number {
  let count = 1;
  for (const into of Object.values(ledger.absorbed)) if (into === id) count += 1;
  return count;
}

export function advancePushes(
  ledger: PushLedger,
  events: readonly GameEvent[],
  state: RunState,
): { ledger: PushLedger; ops: PushOp[] } {
  const local: Record<TicketId, NodeId[]> = {};
  for (const [ticketId, ids] of Object.entries(ledger.local)) local[ticketId] = [...ids];
  const absorbed: Record<NodeId, NodeId> = { ...ledger.absorbed };
  const ops: PushOp[] = [];

  const push = (group: readonly NodeId[], at: number, kind: PushOp["kind"]): void => {
    const into = group[group.length - 1];
    if (into === undefined) return;
    for (const id of group) if (id !== into) absorbed[id] = into;
    ops.push({ nodeIds: group, into, at, kind });
  };

  // Only broken commits are ever left local, and a push keeps none of them.
  // Nothing went through to squash them into: they fold into the commit the
  // branch now ends on. A branch with none stays as it is — never pushed.
  const flush = (ticketId: TicketId, at: number): void => {
    const group = local[ticketId];
    const ticket = state.tickets[ticketId];
    const into = ticket?.nodeIds[ticket.nodeIds.length - 1];
    if (group === undefined || into === undefined) return;
    delete local[ticketId];
    push([...group, into], at, "flush");
  };

  events.forEach((event, at) => {
    switch (event.type) {
      case "node_done": {
        const node = state.nodes[event.nodeId];
        if (node?.ticketId === undefined || !isBornLocal(node)) break;
        const group = [...(local[node.ticketId] ?? []), node.id];
        if (event.broken === true) {
          local[node.ticketId] = group;
          break;
        }
        delete local[node.ticketId];
        push(group, at, "commit");
        break;
      }

      // A pull request is opened from the remote, and a merge lands what is
      // there: the branch and its obstacles go up first.
      case "pr_reviewed":
      case "ticket_merged":
        flush(event.ticketId, at);
        for (const ticket of Object.values(state.tickets)) {
          if (ticket.parentId === event.ticketId) flush(ticket.id, at);
        }
        break;

      // An obstacle lands on its feature's branch: both go up.
      case "obstacle_cleared":
        flush(event.ticketId, at);
        flush(event.parentId, at);
        break;

      default:
        break;
    }
  });

  // A showcase prunes its oldest history: nothing to remember about it.
  for (const [ticketId, ids] of Object.entries(local)) {
    const kept = ids.filter((id) => id in state.nodes);
    if (kept.length > 0) local[ticketId] = kept;
    else delete local[ticketId];
  }
  for (const [id, into] of Object.entries(absorbed)) {
    if (!(id in state.nodes) || !(into in state.nodes)) delete absorbed[id];
  }

  return { ledger: { local, absorbed }, ops };
}
