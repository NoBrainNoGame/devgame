import type { MapNode, NodeId } from "@/game/core/types";

/**
 * Which column each node is drawn in.
 *
 * This is `git log --graph` logic: `main` holds lane 0, every branch takes the
 * leftmost free column to its right, and a column is free again once the branch
 * occupying it has merged. Hotfixes go the other way, into negative lanes, so
 * an emergency reads as an interruption rather than as more feature work, and
 * the rivals go further left still — see `botLane`.
 *
 * It lives in `core` rather than in the renderer because the tests assert on it
 * and because two branches sharing a column is a generation bug, not a drawing
 * one.
 */

/** Numeric part of `${sprint}:${serial}`. Serials are globally increasing. */
export function nodeSerial(id: NodeId): number {
  const colon = id.indexOf(":");
  return colon === -1 ? 0 : Number(id.slice(colon + 1));
}

export function nodeSprint(id: NodeId): number {
  const colon = id.indexOf(":");
  return colon === -1 ? 0 : Number(id.slice(0, colon));
}

interface Span {
  nodes: MapNode[];
  start: number;
  end: number;
}

function toSpans(nodes: MapNode[]): Span[] {
  const byBranch = new Map<string, MapNode[]>();

  for (const node of nodes) {
    if (node.lane === 0 && node.branchId === undefined && isMainKind(node)) continue;
    // A detour has no branch of its own, so it is its own one-node span.
    const key = node.branchId ?? `node:${node.id}`;
    const bucket = byBranch.get(key);
    if (bucket === undefined) byBranch.set(key, [node]);
    else bucket.push(node);
  }

  const spans: Span[] = [];
  for (const group of byBranch.values()) {
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const node of group) {
      if (node.depth < start) start = node.depth;
      if (node.depth > end) end = node.depth;
    }
    spans.push({ nodes: group, start, end });
  }

  spans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aFirst = a.nodes[0];
    const bFirst = b.nodes[0];
    return nodeSerial(aFirst?.id ?? "") - nodeSerial(bFirst?.id ?? "");
  });

  return spans;
}

/**
 * The kinds that live on `main`.
 *
 * No `commit`: nothing is written on the trunk any more. What sits there is
 * the anchor, one merge per feature delivered, and the tail of the sprint —
 * `main` is the base every feature leaves from, not a place you work.
 */
function isMainKind(node: MapNode): boolean {
  // A merge that belongs to a branch is the end of a sub-feature, drawn in its
  // parent's column — not on the trunk.
  if (node.branchId !== undefined) return false;

  return (
    node.kind === "sprint_start" ||
    node.kind === "feature_merge" ||
    node.kind === "sprint_merge" ||
    node.kind === "release"
  );
}

/**
 * Assigns positive lanes to every off-main node in `nodes`. Main-line nodes are
 * left at lane 0. Called once per generated sprint.
 */
export function assignLanes(nodes: MapNode[]): void {
  const busyUntil: number[] = [];

  for (const span of toSpans(nodes)) {
    let lane = 1;
    // `- 1` leaves room for the edge that forks into the span: without it a
    // merge arriving at depth d and a fork leaving at depth d would cross.
    while ((busyUntil[lane] ?? Number.NEGATIVE_INFINITY) >= span.start - 1) lane += 1;

    busyUntil[lane] = span.end;
    for (const node of span.nodes) node.lane = lane;
  }
}

/**
 * The leftmost free negative lane over `[start, end]`, for a branch injected
 * mid-run. Injected branches are short and walked immediately, so in practice
 * this almost always returns -1.
 */
export function pickNegativeLane(nodes: Iterable<MapNode>, start: number, end: number): number {
  const occupied = new Set<number>();

  for (const node of nodes) {
    if (node.lane >= 0) continue;
    if (node.depth < start - 1 || node.depth > end + 1) continue;
    occupied.add(node.lane);
  }

  let lane = -1;
  while (occupied.has(lane)) lane -= 1;
  return lane;
}
