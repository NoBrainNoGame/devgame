import type { Graphics } from "pixi.js";

import { nodeX, nodeY } from "@/game/render/coords";
import { BEND, EDGE_WIDTH } from "@/game/render/theme";

/**
 * How the lines of the graph are drawn.
 *
 * A branch is a continuous vertical line for as long as it is alive, whether
 * or not a commit sits on every row — that is what a git client draws, and
 * what makes `dev` read as a branch rather than as a dot with a name. Between
 * columns an edge leaves its own column, sweeps across on a short curve and
 * arrives travelling straight again. A single bezier from node to node looks
 * like a wire diagram; this looks like history.
 *
 * Everything is in graph space, and the y flip lives in `nodeY` — nothing here
 * needs to know which way time runs.
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

/** A branch's own line, from the row it was born on to the row it lives on. */
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
  // column and arrive vertical. `BEND` is how much room the curve gets; on a
  // single row the whole distance is the curve.
  const towards = Math.sign(y2 - y1);
  const room = Math.min(BEND, Math.abs(y2 - y1) / 2);
  const bendStart = y1 + towards * room;
  const bendEnd = y2 - towards * room;

  graphics
    .moveTo(x1, y1)
    .lineTo(x1, bendStart)
    .bezierCurveTo(x1, bendEnd, x2, bendStart, x2, bendEnd)
    .lineTo(x2, y2);
}
