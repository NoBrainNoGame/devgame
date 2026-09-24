import type { Graphics } from "pixi.js";

import { TICKET_KIND } from "@/game/content";
import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { MapNode, Ticket, TicketId } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { CORNER, EDGE_WIDTH, LANE_DASH, LANE_GAP } from "@/game/render/theme";

/**
 * How the lines of the graph are drawn.
 *
 * A branch is a line between its own commits and nothing more: `main` and
 * `dev` run solid from their first drawn node to their last, then dotted up
 * to the top row to say they are still there; a ticket's line runs from the
 * row it forked on to its tip and stops, whether or not the ticket is open.
 * Nothing runs ahead of a commit that has not happened.
 *
 * Between columns an edge does what a git client draws: it leaves the trunk
 * sideways on the trunk's own row, turns one rounded corner, and travels
 * vertically in the branch's column. Read the other way that is a merge
 * arriving square into the branch it lands on. One rule, both shapes.
 *
 * The geometry is pure (`edgePath`, `laneSegments`) so a test can read it;
 * only the `draw*` functions touch Pixi. Everything is in graph space, and
 * the y flip lives in `nodeY`.
 */

export type EdgeSegment =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  /** A rounded corner: from (x1, y1) towards the control point (cx, cy), ending at (x2, y2). */
  | {
      kind: "arc";
      x1: number;
      y1: number;
      cx: number;
      cy: number;
      x2: number;
      y2: number;
      r: number;
    };

/**
 * The path between a node and its parent. The endpoint with the smaller lane
 * is the trunk end: the horizontal run sits on its row, the vertical run in
 * the other column, and the corner between them is as round as the gap allows.
 */
export function edgePath(
  from: { lane: number; depth: number },
  to: { lane: number; depth: number },
): EdgeSegment[] {
  const [trunk, branch] = from.lane <= to.lane ? [from, to] : [to, from];
  const xt = nodeX(trunk.lane);
  const yt = nodeY(trunk.depth);
  const xb = nodeX(branch.lane);
  const yb = nodeY(branch.depth);

  if (xt === xb) return [{ kind: "line", x1: xt, y1: yt, x2: xb, y2: yb }];
  if (yt === yb) return [{ kind: "line", x1: xt, y1: yt, x2: xb, y2: yb }];

  const sx = Math.sign(xb - xt);
  const sy = Math.sign(yb - yt);
  const r = Math.min(CORNER, Math.abs(xb - xt) / 2, Math.abs(yb - yt) / 2);

  return [
    { kind: "line", x1: xt, y1: yt, x2: xb - sx * r, y2: yt },
    { kind: "arc", x1: xb - sx * r, y1: yt, cx: xb, cy: yt, x2: xb, y2: yt + sy * r, r },
    { kind: "line", x1: xb, y1: yt + sy * r, x2: xb, y2: yb },
  ];
}

export function drawEdge(
  graphics: Graphics,
  from: { lane: number; depth: number },
  to: { lane: number; depth: number },
  colour: number,
  alpha: number,
): void {
  const path = edgePath(from, to);
  const head = path[0];
  if (head === undefined) return;

  graphics.moveTo(head.x1, head.y1);
  for (const segment of path) {
    if (segment.kind === "line") graphics.lineTo(segment.x2, segment.y2);
    else graphics.arcTo(segment.cx, segment.cy, segment.x2, segment.y2, segment.r);
  }
  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha, cap: "round", join: "round" });
}

/** A branch's own line, from one of its rows to another. */
export function drawLane(
  graphics: Graphics,
  lane: number,
  fromDepth: number,
  toDepth: number,
  colour: number,
  alpha: number,
): void {
  if (toDepth <= fromDepth) return;
  const x = nodeX(lane);
  graphics.moveTo(x, nodeY(fromDepth)).lineTo(x, nodeY(toDepth));
  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha, cap: "round" });
}

/**
 * The same line, dotted: a trunk that is still there but has nothing new on
 * it yet. Pixi 8 has no dash style, so the dashes are drawn one by one.
 */
export function drawDottedLane(
  graphics: Graphics,
  lane: number,
  fromDepth: number,
  toDepth: number,
  colour: number,
  alpha: number,
): void {
  if (toDepth <= fromDepth) return;
  const x = nodeX(lane);
  const yStart = nodeY(fromDepth);
  const yEnd = nodeY(toDepth);
  const direction = Math.sign(yEnd - yStart);
  const length = Math.abs(yEnd - yStart);

  // Butt caps: a round cap would grow each dash by half the width and eat
  // the gap, and the dots would read as a line again.
  for (let offset = 0; offset < length; offset += LANE_DASH + LANE_GAP) {
    const y1 = yStart + direction * offset;
    const y2 = yStart + direction * Math.min(length, offset + LANE_DASH);
    graphics.moveTo(x, y1).lineTo(x, y2);
  }
  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha, cap: "butt" });
}

export type LaneColour = "trunk" | "dev" | "feature" | "hotfix" | "refactor" | "obstacle";

export interface LaneSegment {
  lane: number;
  from: number;
  to: number;
  style: "solid" | "dotted";
  colour: LaneColour;
}

/** What a ticket's column is drawn in: an emergency reads as one wherever it sits. */
export function ticketColour(kind: Ticket["kind"] | undefined): LaneColour {
  return kind === undefined ? "feature" : TICKET_KIND[kind].colour;
}

/**
 * The lines to draw for what is on screen. Trunks: solid between their own
 * nodes, dotted from the last one to the top row (`main` with no node yet is
 * dotted all the way, so its column reads as reserved rather than as a gap).
 * Features: one solid segment per *ticket*, so a column two tickets used in
 * turn shows two lines with a gap between them, not one line through both.
 * A feature an obstacle is holding is still there while the obstacle is
 * written beside it: its line goes on dotted to the top row, like a trunk's.
 */
export function laneSegments(
  nodes: readonly Pick<MapNode, "lane" | "depth" | "ticketId">[],
  kindOf: (ticketId: TicketId) => Ticket["kind"] | undefined,
  topDepth: number,
  heldOpen: (ticketId: TicketId) => boolean = () => false,
): LaneSegment[] {
  const segments: LaneSegment[] = [];

  for (const lane of [MAIN_LANE, DEV_LANE]) {
    const colour: LaneColour = lane === MAIN_LANE ? "trunk" : "dev";
    const depths = nodes.filter((node) => node.lane === lane).map((node) => node.depth);
    if (depths.length === 0) {
      if (topDepth > 0) segments.push({ lane, from: 0, to: topDepth, style: "dotted", colour });
      continue;
    }
    const first = Math.min(...depths);
    const last = Math.max(...depths);
    if (last > first) segments.push({ lane, from: first, to: last, style: "solid", colour });
    if (topDepth > last) segments.push({ lane, from: last, to: topDepth, style: "dotted", colour });
  }

  const byTicket = new Map<TicketId, { lane: number; from: number; to: number }>();
  for (const node of nodes) {
    if (node.lane < FIRST_FEATURE_LANE || node.ticketId === undefined) continue;
    const span = byTicket.get(node.ticketId);
    if (span === undefined) {
      byTicket.set(node.ticketId, { lane: node.lane, from: node.depth, to: node.depth });
    } else {
      span.from = Math.min(span.from, node.depth);
      span.to = Math.max(span.to, node.depth);
    }
  }
  for (const [ticketId, span] of byTicket) {
    const colour = ticketColour(kindOf(ticketId));
    if (span.to > span.from) segments.push({ ...span, style: "solid", colour });
    if (heldOpen(ticketId) && topDepth > span.to) {
      segments.push({ lane: span.lane, from: span.to, to: topDepth, style: "dotted", colour });
    }
  }

  return segments;
}
