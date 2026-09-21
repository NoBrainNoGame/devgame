import type { MapNode, NodeId } from "@/game/core/types";

/**
 * Which column each node is drawn in.
 *
 * This is `git log --graph` logic, with the two long-lived branches pinned:
 * `main` holds lane 0 and `dev` holds lane 1. Every feature takes the leftmost
 * free column to the right of `dev`, and a column is free again once the branch
 * occupying it has merged. The rivals work in negative lanes — see `botLane` in
 * `rules/bots.ts` — so their work reads as somebody else's, not as yours.
 *
 * It lives in `core` rather than in the renderer because the tests assert on it
 * and because two branches sharing a column is a generation bug, not a drawing
 * one.
 */

/** `main`: nothing but the sprint merge and the release it ships. */
export const MAIN_LANE = 0;
/** `dev`: where every feature is integrated, yours and the rivals'. */
export const DEV_LANE = 1;
/** The first column a feature branch may take. */
export const FIRST_FEATURE_LANE = 2;

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
    if (isTrunkNode(node)) continue;
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
 * True for a node the generator has already placed on a long-lived branch.
 *
 * Nothing is ever *written* on either of them: `main` receives the sprint merge
 * and the release, `dev` receives the anchor and one merge per feature. A merge
 * carrying a `branchId` is the end of a feature that left another feature, so it
 * belongs in its parent's column and is laid out like any other branch node.
 */
export function isTrunkNode(node: MapNode): boolean {
  if (node.branchId !== undefined) return false;

  return (
    node.kind === "sprint_start" ||
    node.kind === "feature_merge" ||
    node.kind === "sprint_merge" ||
    node.kind === "release"
  );
}

/**
 * Assigns a column to every feature node in `nodes`. Trunk nodes keep the lane
 * the generator gave them. Called once per generated sprint.
 */
export function assignLanes(nodes: MapNode[]): void {
  const busyUntil: number[] = [];

  for (const span of toSpans(nodes)) {
    let lane = FIRST_FEATURE_LANE;
    // `- 1` leaves room for the edge that forks into the span: without it a
    // merge arriving at depth d and a fork leaving at depth d would cross.
    while ((busyUntil[lane] ?? Number.NEGATIVE_INFINITY) >= span.start - 1) lane += 1;

    busyUntil[lane] = span.end;
    for (const node of span.nodes) node.lane = lane;
  }
}

/**
 * The leftmost free feature column over `[start, end]`, for a branch spliced in
 * mid-run.
 *
 * Injected branches are short and walked immediately, so in practice this
 * almost always returns the first feature lane.
 */
export function pickFeatureLane(nodes: Iterable<MapNode>, start: number, end: number): number {
  const occupied = new Set<number>();

  for (const node of nodes) {
    if (node.lane < FIRST_FEATURE_LANE) continue;
    if (node.depth < start - 1 || node.depth > end + 1) continue;
    occupied.add(node.lane);
  }

  let lane = FIRST_FEATURE_LANE;
  while (occupied.has(lane)) lane += 1;
  return lane;
}
