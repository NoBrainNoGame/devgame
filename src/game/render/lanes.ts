import type { Graphics } from "pixi.js";

import { nodeX, nodeY } from "@/game/render/coords";
import { BEND, EDGE_WIDTH } from "@/game/render/theme";

/**
 * How an edge between two commits is drawn.
 *
 * Within a column it is a straight line. Between columns it is the shape a
 * desktop git client draws: the lane leaves its own column, sweeps across on a
 * short curve, and arrives travelling straight again. A single bezier from node
 * to node looks like a wire diagram; this looks like history.
 *
 * Both arguments are in graph space, and the y flip lives in `nodeY` — nothing
 * here needs to know which way time runs.
 */
export function drawEdge(
  graphics: Graphics,
  from: { lane: number; depth: number },
  to: { lane: number; depth: number },
  colour: number,
  alpha: number,
): void {
  drawEdgeShape(graphics, from, to);
  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha, cap: "round", join: "round" });
}

/**
 * The same shape, drawn to recede.
 *
 * A rival's history is real work and has to be visible, but four of them
 * crossing to `dev` twice a feature will drown yours if they are drawn with
 * the same weight. Thinner and fainter puts them behind.
 */
export function drawBackgroundEdge(
  graphics: Graphics,
  from: { lane: number; depth: number },
  to: { lane: number; depth: number },
  colour: number,
): void {
  drawEdgeShape(graphics, from, to);
  graphics.stroke({ width: EDGE_WIDTH - 2, color: colour, alpha: 0.3, cap: "round" });
}

/** The path an edge follows, without committing to how it is stroked. */
function drawEdgeShape(
  graphics: Graphics,
  from: { lane: number; depth: number },
  to: { lane: number; depth: number },
): void {
  const x1 = nodeX(from.lane);
  const y1 = nodeY(from.depth);
  const x2 = nodeX(to.lane);
  const y2 = nodeY(to.depth);

  if (x1 === x2) {
    graphics.moveTo(x1, y1).lineTo(x2, y2);
    return;
  }

  // Travel in the origin column first, then bend once into the destination
  // column and arrive vertical. `BEND` is how much room the curve gets.
  const towards = Math.sign(y2 - y1);
  const bendStart = y1 + towards * BEND;
  const bendEnd = y2 - towards * BEND;

  graphics
    .moveTo(x1, y1)
    .lineTo(x1, bendStart)
    .bezierCurveTo(x1, bendEnd, x2, bendStart, x2, bendEnd)
    .lineTo(x2, y2);
}
