import { allNodes, getNode } from "@/game/core/map/graph";
import { pickFeatureLane } from "@/game/core/map/layout";
import { emit, type RuleContext } from "@/game/core/rules/context";
import type { BranchId, MapNode, NodeId, NodeKind } from "@/game/core/types";

/**
 * Splices mandatory commits in front of the player: a hotfix after a production
 * bug, a forced refactor after the debt explodes.
 *
 * They go **on the branch the player is already on**, in its column. A
 * production bug does not open a feature — it is `fix:` commits you have to
 * write before you can go back to what you were doing, and that is exactly what
 * a chain of extra nodes in the same lane reads as. Putting them in a column of
 * their own made a branch with no merge, which is not a thing git can express.
 *
 * Every node deeper than the insertion point is pushed down to make room. That
 * keeps "depth strictly increases along every edge" true, which the renderer
 * and the invariant checks both rely on. Bot positions are indexes into `dev`,
 * not depths, so shifting is invisible to them — see `devLineNodes`.
 */
export function injectBranch(
  context: RuleContext,
  kind: "hotfix" | "refactor",
  count: number,
): { branchId: BranchId; nodeIds: NodeId[] } | null {
  if (count <= 0) return null;

  const { state } = context;
  const current = getNode(state, state.player.nodeId);
  const rejoin = [...current.next];

  // Nothing to splice into: the release node ends the sprint by itself.
  if (rejoin.length === 0) return null;

  // On a feature branch the work goes inline: a production bug is `fix:`
  // commits you write before you can carry on, not a branch of its own. On a
  // long-lived branch there is nothing to write on, so it really is a branch —
  // and a branch ends in a merge, which needs one more row.
  const onTrunk = current.branchId === undefined;
  const rows = onTrunk ? count + 1 : count;

  const insertDepth = current.depth;
  for (const node of allNodes(state)) {
    if (node.depth > insertDepth) node.depth += rows;
  }

  // The rivals' columns share the same rows, so they move with everything else.
  // Leaving them put slid a rival's merge onto a row one of the player's own
  // merges had just been pushed into — two merges drawn on the same spot of a
  // branch that only ever has one.
  for (const node of Object.values(state.botNodes)) {
    if (node.depth > insertDepth) node.depth += rows;
  }
  for (const bot of Object.values(state.bots)) {
    if (bot.depth > insertDepth) bot.depth += rows;
  }

  const nodeKind: NodeKind = kind === "hotfix" ? "hotfix" : "refactor";
  const created: MapNode[] = [];

  for (let i = 0; i < count; i++) {
    const id: NodeId = `${state.sprint}:${state.nextNodeSerial}`;
    state.nextNodeSerial += 1;
    created.push({
      id,
      sprint: state.sprint,
      kind: nodeKind,
      lane: current.lane,
      depth: insertDepth + 1 + i,
      next: [],
      status: "locked",
    });
  }

  for (let i = 0; i < count - 1; i++) {
    const node = created[i];
    const successor = created[i + 1];
    if (node === undefined || successor === undefined) continue;
    node.next = [successor.id];
  }

  const head = created[0];
  const tail = created[count - 1];
  if (head === undefined || tail === undefined) return null;

  current.next = [head.id];

  const branchId: BranchId = current.branchId ?? `b${state.nextBranchSerial}`;
  if (current.branchId === undefined) state.nextBranchSerial += 1;
  for (const node of created) node.branchId = branchId;

  if (onTrunk) {
    // A real branch off `dev`, closed by a real merge.
    const mergeId: NodeId = `${state.sprint}:${state.nextNodeSerial}`;
    state.nextNodeSerial += 1;

    const merge: MapNode = {
      id: mergeId,
      sprint: state.sprint,
      kind: "feature_merge",
      lane: current.lane,
      depth: insertDepth + count + 1,
      next: [...rejoin].sort(),
      status: "locked",
    };
    tail.next = [mergeId];

    for (const node of created) state.nodes[node.id] = node;
    state.nodes[mergeId] = merge;

    const lane = pickFeatureLane(
      allNodes(state).filter((node) => !created.includes(node)),
      head.depth,
      tail.depth,
    );
    for (const node of created) node.lane = lane;

    state.branches[branchId] = {
      id: branchId,
      kind,
      nodeIds: created.map((node) => node.id),
      mergeInto: mergeId,
      // Injected work is not optional: you are already on it.
      open: true,
      merged: false,
    };
  } else {
    tail.next = [...rejoin].sort();
    for (const node of created) state.nodes[node.id] = node;

    const branch = state.branches[branchId];
    if (branch !== undefined) {
      branch.nodeIds = [...branch.nodeIds, ...created.map((node) => node.id)];
    }
  }

  const nodeIds = created.map((node) => node.id);
  emit(context, { type: "nodes_injected", branchId, nodeIds, kind });

  return { branchId, nodeIds };
}
