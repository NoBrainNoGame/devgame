import { TREE, type TreeBranch, type TreeNodeId, treeBranch } from "@/game/content";

/**
 * Where each skill sits in its branch, the way a talent tree is drawn: a grid
 * three columns wide, a node under what it requires, the lines between them
 * the requirements. Placed by hand, as those trees are — an automatic layout
 * puts management's five roots in one row that no screen holds. Presentation
 * only: the engine never reads it. Lower rows hold the dearer nodes, so the
 * eye reads down a branch as it would spend.
 */

export const TREE_COLUMNS = 3;

export interface TreeSlot {
  col: number;
  row: number;
}

export const TREE_LAYOUT: Record<TreeNodeId, TreeSlot> = {
  ci: { col: 1, row: 0 },
  cd: { col: 0, row: 1 },
  auto_rebase: { col: 2, row: 1 },
  review_bot: { col: 1, row: 2 },

  monitoring: { col: 0, row: 0 },
  dependabot: { col: 2, row: 0 },
  auto_linter: { col: 0, row: 1 },
  sre: { col: 1, row: 1 },

  agile_coach: { col: 0, row: 0 },
  recruiter: { col: 1, row: 0 },
  growth_hacking: { col: 2, row: 0 },
  mentoring: { col: 0, row: 1 },
  product_owner: { col: 1, row: 1 },
  fast_forward: { col: 2, row: 1 },

  stamina: { col: 0, row: 0 },
  luck: { col: 1, row: 0 },
  calm: { col: 2, row: 0 },
};

/** A requirement, drawn: `from` must reach `level` before `to` takes a point. */
export interface TreeLink {
  from: TreeNodeId;
  to: TreeNodeId;
  level: number;
}

export function branchLinks(branch: TreeBranch): TreeLink[] {
  return treeBranch(branch).flatMap((to) =>
    (TREE[to].requires ?? []).map((req) => ({ from: req.id, to, level: req.level })),
  );
}

/** Rows these branches need: the lowest node's row, plus one. */
export function treeRows(branches: readonly TreeBranch[]): number {
  let rows = 1;
  for (const branch of branches) {
    for (const id of treeBranch(branch)) rows = Math.max(rows, TREE_LAYOUT[id].row + 1);
  }
  return rows;
}

/**
 * The connector from a node to one that requires it, in cell units (a cell is
 * one by one, a node sits at its centre): down out of the parent, across at
 * the top of the child's row, down into the child. A straight drop when they
 * share a column.
 */
export function linkPath(link: TreeLink): string {
  const from = TREE_LAYOUT[link.from];
  const to = TREE_LAYOUT[link.to];
  const fx = from.col + 0.5;
  const tx = to.col + 0.5;
  const turn = to.row;
  return fx === tx
    ? `M${fx} ${from.row + 0.5} V${to.row + 0.5}`
    : `M${fx} ${from.row + 0.5} V${turn} H${tx} V${to.row + 0.5}`;
}

/** Points a node has taken so far: the price of every level placed. */
export function spentOn(id: TreeNodeId, level: number): number {
  return TREE[id].cost.slice(0, level).reduce((sum, cost) => sum + cost, 0);
}
