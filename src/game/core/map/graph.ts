import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE, nodeSerial } from "@/game/core/map/layout";
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
export function devLineNodes(state: RunState, sprint: number): MapNode[] {
  return Object.keys(state.nodes)
    .sort((a, b) => nodeSerial(a) - nodeSerial(b))
    .map((id) => getNode(state, id))
    .filter((node) => node.sprint === sprint && node.lane === DEV_LANE)
    .sort((a, b) => a.depth - b.depth);
}

/**
 * How far along `main` a node sits: the index of the last trunk node at or
 * before it.
 *
 * This is the unit the race is run in. A rival holds an index into the main
 * line, so the player needs the same number for the two to be subtracted — and
 * a node on a branch or a detour sits *between* two trunk nodes rather than
 * adding to the count.
 */
export function devLineIndexOf(state: RunState, node: MapNode): number {
  // Counted rather than sorted. This runs on every node the player resolves,
  // and the node map grows for the whole run: sorting it here made a long run
  // measurably slower with every turn.
  let seen = 0;
  for (const candidate of Object.values(state.nodes)) {
    if (candidate.sprint !== node.sprint || candidate.lane !== DEV_LANE) continue;
    if (candidate.depth <= node.depth) seen += 1;
  }
  return Math.max(0, seen - 1);
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
  // Unsorted on purpose: clearing a status is order-independent, and this walks
  // every node in the run every time the player moves.
  for (const node of Object.values(state.nodes)) {
    if (node.status === "candidate") node.status = "locked";
  }
  for (const id of ids) {
    const node = getNode(state, id);
    if (node.status === "done") continue;
    node.status = "candidate";
  }
}

/** True while the player stands on a feature branch rather than on `main` or `dev`. */
export function isOnBranch(state: RunState): boolean {
  return getNode(state, state.player.nodeId).lane >= FIRST_FEATURE_LANE;
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
  // other. `main` and `dev` are exempt: each is a single chain.
  const occupied = new Map<string, NodeId>();
  for (const node of nodes) {
    if (node.lane === MAIN_LANE || node.lane === DEV_LANE) continue;
    const key = `${node.lane}@${node.depth}`;
    const previous = occupied.get(key);
    if (previous !== undefined) {
      failures.push({ rule: "lane-collision", detail: `${previous} and ${node.id} at ${key}` });
    }
    occupied.set(key, node.id);
  }

  // What may sit on each long-lived branch. Nothing is ever *written* on
  // either: `main` ships sprints, `dev` integrates features, and everything
  // else happens on a branch that leaves `dev` and comes back.
  for (const node of nodes) {
    if (node.lane === MAIN_LANE) {
      if (node.kind !== "sprint_merge" && node.kind !== "release") {
        failures.push({ rule: "main-ships-only", detail: `${node.id} is a ${node.kind}` });
      }
    } else if (node.lane === DEV_LANE) {
      if (node.kind !== "sprint_start" && node.kind !== "feature_merge") {
        failures.push({ rule: "dev-integrates-only", detail: `${node.id} is a ${node.kind}` });
      }
      if (node.branchId !== undefined) {
        failures.push({ rule: "dev-is-not-a-branch", detail: node.id });
      }
    } else if (node.branchId === undefined) {
      failures.push({ rule: "work-belongs-to-a-branch", detail: node.id });
    }
  }

  // A branch is a branch: exactly one edge leads into it, and it ends in a
  // merge. Anything else is a fork that never comes home, which is not a shape
  // git can express.
  const branchHeads = new Map<string, MapNode[]>();
  for (const node of nodes) {
    if (node.branchId === undefined) continue;
    const bucket = branchHeads.get(node.branchId);
    if (bucket === undefined) branchHeads.set(node.branchId, [node]);
    else bucket.push(node);
  }

  const headOfBranch = new Map<string, NodeId>();
  for (const [branchId, group] of branchHeads) {
    const lowest = group.reduce((best, node) => (node.depth < best.depth ? node : best));
    headOfBranch.set(branchId, lowest.id);
  }

  for (const [branchId, group] of branchHeads) {
    const ids = new Set(group.map((node) => node.id));
    const head = group.reduce((lowest, node) => (node.depth < lowest.depth ? node : lowest));

    // Exactly one edge forks into the branch. Anything else arriving from
    // outside has to be landing on a merge — a branch that left this one and
    // is coming home, which is a merge commit's second parent.
    let forks = 0;
    for (const node of nodes) {
      if (ids.has(node.id)) continue;
      for (const id of node.next) {
        if (!ids.has(id)) continue;
        if (id === head.id) forks += 1;
        else if (byId.get(id)?.kind !== "feature_merge") {
          failures.push({ rule: "branch-entered-mid-way", detail: `${node.id} -> ${id}` });
        }
      }
    }
    if (forks !== 1) {
      failures.push({ rule: "branch-has-one-fork", detail: `${branchId} forks ${forks} times` });
    }

    // Leaving the branch is either coming home — onto a merge — or forking
    // into a branch of your own, which lands on that branch's first commit.
    for (const node of group) {
      for (const id of node.next) {
        if (ids.has(id)) continue;
        const landing = byId.get(id);
        if (landing === undefined) continue;

        const isMerge = landing.kind === "feature_merge" || landing.kind === "sprint_merge";
        if (isMerge || headOfBranch.get(landing.branchId ?? "") === landing.id) continue;

        failures.push({
          rule: "branch-ends-in-a-merge",
          detail: `${branchId} leaves to ${id}, a ${landing.kind}`,
        });
      }
    }
  }

  return failures;
}
