import { nodeSerial } from "@/game/core/map/layout";
import type { MapNode, NodeId, RunState } from "@/game/core/types";

/**
 * Reading and checking the graph. Nothing here mutates state except
 * `setCandidates`, which is the one place node status is allowed to change as a
 * group.
 */

export function getNode(state: RunState, id: NodeId): MapNode {
  const node = state.nodes[id];
  if (node === undefined) throw new Error(`Unknown node ${id}`);
  return node;
}

export function successors(state: RunState, id: NodeId): MapNode[] {
  return getNode(state, id).next.map((next) => getNode(state, next));
}

/**
 * The main line of a sprint, in order. Bot progress is an index into this, not
 * a depth: injecting a hotfix shifts every depth after it, and a bot should not
 * appear to leap because the player broke production.
 */
export function mainLineNodes(state: RunState, sprint: number): MapNode[] {
  return Object.keys(state.nodes)
    .sort((a, b) => nodeSerial(a) - nodeSerial(b))
    .map((id) => getNode(state, id))
    .filter((node) => node.sprint === sprint && node.lane === 0)
    .sort((a, b) => a.depth - b.depth);
}

/** Every node in the run, in a stable order. Iteration order must never vary. */
export function allNodes(state: RunState): MapNode[] {
  return Object.keys(state.nodes)
    .sort((a, b) => nodeSerial(a) - nodeSerial(b))
    .map((id) => getNode(state, id));
}

/**
 * Marks `ids` as the places the player may step next, and clears any previous
 * candidacy. Nodes already resolved keep their `done` status.
 */
export function setCandidates(state: RunState, ids: readonly NodeId[]): void {
  for (const node of allNodes(state)) {
    if (node.status === "candidate") node.status = "locked";
  }
  for (const id of ids) {
    const node = getNode(state, id);
    if (node.status === "done") continue;
    node.status = "candidate";
  }
}

/** True while the player stands somewhere that is not the main line. */
export function isOnBranch(state: RunState): boolean {
  return getNode(state, state.player.nodeId).lane !== 0;
}

export function isOnHotfix(state: RunState): boolean {
  const node = getNode(state, state.player.nodeId);
  return node.kind === "hotfix";
}

export interface InvariantFailure {
  rule: string;
  detail: string;
}

/**
 * Structural rules the generator must never break. Checked in tests over
 * hundreds of seeds rather than at runtime — a malformed graph is a bug in
 * generation, and failing loudly in a player's browser helps nobody.
 */
export function checkInvariants(nodes: readonly MapNode[]): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const byId = new Map<NodeId, MapNode>();
  for (const node of nodes) byId.set(node.id, node);

  const starts = nodes.filter((node) => node.kind === "sprint_start");
  const releases = nodes.filter((node) => node.kind === "release");

  if (starts.length !== 1) {
    failures.push({ rule: "one-start", detail: `${starts.length} sprint_start nodes` });
  }
  if (releases.length !== 1) {
    failures.push({ rule: "one-release", detail: `${releases.length} release nodes` });
  }

  for (const node of nodes) {
    if (node.kind === "release") {
      if (node.next.length !== 0) {
        failures.push({ rule: "release-is-terminal", detail: node.id });
      }
    } else if (node.next.length < 1 || node.next.length > 3) {
      failures.push({
        rule: "successor-count",
        detail: `${node.id} has ${node.next.length} successors`,
      });
    }

    const sorted = [...node.next].sort();
    if (sorted.join(",") !== node.next.join(",")) {
      failures.push({ rule: "successors-sorted", detail: node.id });
    }

    for (const nextId of node.next) {
      const next = byId.get(nextId);
      if (next === undefined) {
        failures.push({ rule: "successor-exists", detail: `${node.id} -> ${nextId}` });
        continue;
      }
      if (next.depth <= node.depth) {
        failures.push({
          rule: "depth-increases",
          detail: `${node.id}(${node.depth}) -> ${nextId}(${next.depth})`,
        });
      }
    }
  }

  const start = starts[0];
  if (start !== undefined) {
    const seen = new Set<NodeId>();
    const stack = [start.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (node !== undefined) stack.push(...node.next);
    }

    for (const node of nodes) {
      if (!seen.has(node.id)) {
        failures.push({ rule: "reachable", detail: node.id });
      }
    }
  }

  // Two branches sharing a column at the same depth would draw on top of each
  // other. Lane 0 is exempt: the main line is a single chain.
  const occupied = new Map<string, NodeId>();
  for (const node of nodes) {
    if (node.lane === 0) continue;
    const key = `${node.lane}@${node.depth}`;
    const previous = occupied.get(key);
    if (previous !== undefined) {
      failures.push({ rule: "lane-collision", detail: `${previous} and ${node.id} at ${key}` });
    }
    occupied.set(key, node.id);
  }

  return failures;
}
