import type { MapNode, NodeId } from "@/game/core/types";

/**
 * Which row of the screen a commit sits on.
 *
 * The engine gives every node its own depth, and the graph used to draw one
 * row per depth. Commits pushed together are squashed into the most recent
 * one, though, and a squash that only hid their discs left their rows empty:
 * a hole in the history under the commit they became. So a row is a depth
 * less the squashed commits below it. The rows they held go with them, the
 * history above slides down, and the squashed commit ends on the row of the
 * oldest one it took in. A squashed commit is drawn on the row of the commit
 * it went into, which keeps the lines that led to it pointing there.
 *
 * Presentation only: the engine's depths never change.
 */
export interface Rows {
  of(node: Pick<MapNode, "id" | "depth">): number;
}

export function rowsOf(
  nodes: Readonly<Record<NodeId, MapNode>>,
  absorbed: ReadonlyMap<NodeId, NodeId>,
): Rows {
  const gone: number[] = [];
  for (const id of absorbed.keys()) {
    const node = nodes[id];
    if (node !== undefined) gone.push(node.depth);
  }
  gone.sort((a, b) => a - b);

  // Squashed rows strictly below a depth: a binary search, since this runs
  // for every commit drawn.
  const below = (depth: number): number => {
    let lo = 0;
    let hi = gone.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((gone[mid] ?? 0) < depth) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const of = (node: Pick<MapNode, "id" | "depth">): number => {
    // Squashed commits are never squashed again, but a chain costs nothing to follow.
    let target: Pick<MapNode, "id" | "depth"> = node;
    for (let hops = 0; hops < 8; hops += 1) {
      const into = absorbed.get(target.id);
      const next = into === undefined ? undefined : nodes[into];
      if (next === undefined) break;
      target = next;
    }
    return target.depth - below(target.depth);
  };

  return { of };
}
