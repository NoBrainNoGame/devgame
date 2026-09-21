import { allNodes, getNode } from "@/game/core/map/graph";
import { pickNegativeLane } from "@/game/core/map/layout";
import { emit, type RuleContext } from "@/game/core/rules/context";
import type { Branch, BranchId, MapNode, NodeId, NodeKind } from "@/game/core/types";

/**
 * Splices a short mandatory branch in front of the player: a hotfix after a
 * production bug, a forced refactor after the debt explodes.
 *
 * Injected nodes take negative lanes, to the left of `main`, so an emergency
 * reads differently from feature work.
 *
 * Every node deeper than the insertion point is pushed down to make room. That
 * keeps "depth strictly increases along every edge" true, which the renderer
 * and the invariant checks both rely on. Bot positions are indexes into the
 * main line, not depths, so shifting is invisible to them — see
 * `mainLineNodes`.
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

  const insertDepth = current.depth;
  for (const node of allNodes(state)) {
    if (node.depth > insertDepth) node.depth += count;
  }

  const branchId: BranchId = `b${state.nextBranchSerial}`;
  state.nextBranchSerial += 1;

  const nodeKind: NodeKind = kind === "hotfix" ? "hotfix" : "refactor";
  const created: MapNode[] = [];

  for (let i = 0; i < count; i++) {
    const id: NodeId = `${state.sprint}:${state.nextNodeSerial}`;
    state.nextNodeSerial += 1;
    created.push({
      id,
      sprint: state.sprint,
      kind: nodeKind,
      lane: -1,
      depth: insertDepth + 1 + i,
      next: [],
      branchId,
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

  tail.next = [...rejoin].sort();
  current.next = [head.id];

  for (const node of created) state.nodes[node.id] = node;

  const lane = pickNegativeLane(
    allNodes(state).filter((node) => !created.includes(node)),
    head.depth,
    tail.depth,
  );
  for (const node of created) node.lane = lane;

  const mergeInto = rejoin[0];
  const branch: Branch = {
    id: branchId,
    kind,
    nodeIds: created.map((node) => node.id),
    mergeInto: mergeInto ?? current.id,
    // Injected branches are not optional: you are already on them.
    open: true,
    merged: false,
  };
  state.branches[branchId] = branch;

  const nodeIds = branch.nodeIds;
  emit(context, { type: "nodes_injected", branchId, nodeIds, kind });

  return { branchId, nodeIds };
}
