import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE, nodeSerial } from "@/game/core/map/layout";
import type { MapNode, NodeId, RunState, Ticket } from "@/game/core/types";

/**
 * Reading and checking the graph. Nothing here mutates state.
 */

export function getNode(state: RunState, id: NodeId): MapNode {
  const node = state.nodes[id];
  if (node === undefined) throw new Error(`Unknown node ${id}`);
  return node;
}

/** Every node in the run, in a stable order. Iteration order must never vary. */
export function allNodes(state: RunState): MapNode[] {
  return Object.keys(state.nodes)
    .sort((a, b) => nodeSerial(a) - nodeSerial(b))
    .map((id) => getNode(state, id));
}

/** The newest node in a column, or null when nothing has been written there. */
export function tipOfLane(state: RunState, lane: number): MapNode | null {
  let best: MapNode | null = null;
  for (const node of Object.values(state.nodes)) {
    if (node.lane !== lane) continue;
    if (best === null || node.depth > best.depth) best = node;
  }
  return best;
}

/** The newest commit on the ticket, or null before its first. */
export function tipOfTicket(state: RunState, ticket: Ticket): MapNode | null {
  const last = ticket.nodeIds[ticket.nodeIds.length - 1];
  return last === undefined ? null : getNode(state, last);
}

/**
 * `HEAD`: the last commit actually written, where the graph draws the player.
 *
 * Derived rather than stored. It is the tip of the ticket being written, or the
 * tip of `dev` when there is none — or when the ticket has no commit yet, since
 * a branch that has not been forked is still `dev`. Five different rules would
 * have to keep a stored copy right; none has to keep this one.
 */
export function headOf(state: RunState): MapNode {
  const ticketId = state.player.ticketId;
  const ticket = ticketId === null ? undefined : state.tickets[ticketId];
  const onTicket = ticket === undefined ? null : tipOfTicket(state, ticket);
  if (onTicket !== null) return onTicket;

  const dev = tipOfLane(state, DEV_LANE);
  if (dev === null) throw new Error("headOf: nothing has been written on dev");
  return dev;
}

export interface InvariantFailure {
  rule: string;
  detail: string;
}

/**
 * Structural rules the engine must never break. Checked in tests over hundreds
 * of played seeds rather than at runtime — a malformed graph is a bug in a
 * rule, and failing loudly in a player's browser helps nobody.
 */
export function checkInvariants(state: RunState): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const nodes = Object.values(state.nodes);

  // The DAG reads by parents, the way git does: every parent exists, and it
  // was written before the commit that points at it.
  for (const node of nodes) {
    if (node.parents.length > 2) {
      failures.push({ rule: "at-most-two-parents", detail: node.id });
    }
    for (const parentId of node.parents) {
      const parent = state.nodes[parentId];
      if (parent === undefined) {
        failures.push({ rule: "parent-exists", detail: `${node.id} -> ${parentId}` });
        continue;
      }
      if (parent.depth >= node.depth) {
        failures.push({
          rule: "depth-increases",
          detail: `${parentId}(${parent.depth}) -> ${node.id}(${node.depth})`,
        });
      }
    }
  }

  // Two commits on the same spot would draw on top of each other.
  const occupied = new Map<string, NodeId>();
  for (const node of nodes) {
    const key = `${node.lane}@${node.depth}`;
    const previous = occupied.get(key);
    if (previous !== undefined) {
      failures.push({ rule: "lane-collision", detail: `${previous} and ${node.id} at ${key}` });
    }
    occupied.set(key, node.id);
  }

  // What may sit on each long-lived branch. Nothing is ever *written* on
  // either: `main` ships sprints, `dev` integrates tickets, and everything
  // else happens in a ticket's column.
  for (const node of nodes) {
    if (node.lane === MAIN_LANE) {
      if (node.kind !== "sprint_merge" && node.kind !== "release") {
        failures.push({ rule: "main-ships-only", detail: `${node.id} is a ${node.kind}` });
      }
    } else if (node.lane === DEV_LANE) {
      if (node.kind !== "sprint_start" && node.kind !== "feature_merge") {
        failures.push({ rule: "dev-integrates-only", detail: `${node.id} is a ${node.kind}` });
      }
    } else {
      if (node.lane < FIRST_FEATURE_LANE) {
        failures.push({ rule: "work-belongs-to-a-column", detail: node.id });
      }
      if (node.ticketId === undefined) {
        failures.push({ rule: "work-belongs-to-a-ticket", detail: node.id });
      }
    }
  }

  // The team's tickets are open, held by someone on the roster, and never
  // the one in your hand. A merged ticket belongs to nobody.
  const roster = new Set(state.devs.map((dev) => dev.id));
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.assignee === undefined) continue;
    if (!roster.has(ticket.assignee)) {
      failures.push({ rule: "assignee-on-roster", detail: `${ticket.id} -> ${ticket.assignee}` });
    }
    if (ticket.status !== "open") {
      failures.push({ rule: "assigned-is-open", detail: `${ticket.id} is ${ticket.status}` });
    }
    if (state.player.ticketId === ticket.id) {
      failures.push({ rule: "assigned-is-not-in-hand", detail: ticket.id });
    }
  }

  // A ticket is a chain: each commit's first parent is the previous one, and
  // the first commit forks off `dev`. Two open tickets never share a column,
  // and a column is held exactly when the ticket has written something.
  const lanes = new Map<number, string>();
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.status === "open" && ticket.lane !== undefined) {
      const other = lanes.get(ticket.lane);
      if (other !== undefined) {
        failures.push({ rule: "one-ticket-per-lane", detail: `${other} and ${ticket.id}` });
      }
      lanes.set(ticket.lane, ticket.id);
    }
    if (ticket.status === "open" && (ticket.lane === undefined) !== (ticket.nodeIds.length === 0)) {
      failures.push({ rule: "lane-follows-commits", detail: ticket.id });
    }
    if (
      ticket.status === "cancelled" &&
      (ticket.nodeIds.length > 0 || ticket.lane !== undefined || ticket.assignee !== undefined)
    ) {
      failures.push({ rule: "cancelled-is-empty", detail: ticket.id });
    }
    if (ticket.status === "open") {
      for (const id of ticket.nodeIds) {
        const node = state.nodes[id];
        if (node !== undefined && node.lane !== ticket.lane) {
          failures.push({ rule: "ticket-nodes-in-lane", detail: `${ticket.id} -> ${id}` });
        }
      }
    }

    ticket.nodeIds.forEach((id, index) => {
      const node = state.nodes[id];
      if (node === undefined) {
        failures.push({ rule: "ticket-node-exists", detail: `${ticket.id} -> ${id}` });
        return;
      }
      const expected = index === 0 ? undefined : ticket.nodeIds[index - 1];
      const first = node.parents[0];
      const firstIsDev = first !== undefined && state.nodes[first]?.lane === DEV_LANE;
      if (expected === undefined ? !firstIsDev : first !== expected) {
        failures.push({ rule: "ticket-is-a-chain", detail: `${ticket.id} at ${id}` });
      }
    });
  }

  return failures;
}
