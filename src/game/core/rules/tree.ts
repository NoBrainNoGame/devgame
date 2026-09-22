import { TREE, type TreeNodeId, treeCost } from "@/game/content";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { syncEnergyMax } from "@/game/core/rules/energy";

/**
 * Placing a skill point costs no turn.
 * It is free in time and expensive in tempo: the points come from surviving
 * sprints, from the account's level and from the shop, so spending one is
 * always something you did instead of something else.
 */

interface TreeState {
  tree: Record<TreeNodeId, number>;
  skillPoints: number;
}

/** Whether every node this one depends on is high enough. */
export function treeUnlocked(state: Pick<TreeState, "tree">, id: TreeNodeId): boolean {
  return (TREE[id].requires ?? []).every((req) => (state.tree[req.id] ?? 0) >= req.level);
}

export function canPlaceTree(state: TreeState, id: TreeNodeId): boolean {
  const level = state.tree[id] ?? 0;
  const cost = treeCost(id, level);
  return cost !== undefined && cost <= state.skillPoints && treeUnlocked(state, id);
}

export function placeTree(context: RuleContext, id: TreeNodeId): void {
  const { state } = context;
  const level = state.tree[id] ?? 0;
  const cost = treeCost(id, level);

  if (cost === undefined) throw new Error(`${id} is already at level ${TREE[id].maxLevel}`);
  if (cost > state.skillPoints)
    throw new Error(`${id} costs ${cost}, you have ${state.skillPoints}`);
  if (!treeUnlocked(state, id)) throw new Error(`${id} needs its prerequisites first`);

  state.skillPoints -= cost;
  state.tree[id] = level + 1;

  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "tree_placed", id, level: level + 1 });
  emit(context, { type: "skill_points", delta: -cost, value: state.skillPoints });
}
