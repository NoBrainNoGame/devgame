import type { Graphics } from "pixi.js";

import { nodeX, nodeY } from "@/game/render/coords";
import { BEND, EDGE_WIDTH, NODE_RADIUS } from "@/game/render/theme";

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
  const x1 = nodeX(from.lane);
  const y1 = nodeY(from.depth);
  const x2 = nodeX(to.lane);
  const y2 = nodeY(to.depth);

  if (x1 === x2) {
    graphics.moveTo(x1, y1).lineTo(x2, y2);
  } else {
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

  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha, cap: "round", join: "round" });
}

/**
 * A branch still open from where you stand: one row of lane, ending in a hollow
 * ring where the commit would land.
 *
 * The ring matters. A stub that just stops is read as an edge that failed to
 * draw; a ring is read as an empty slot, which is what it is. It says how wide
 * the decision is — one ring above you is a corridor, three is a fork — and
 * nothing at all about what the commit would contain. That belongs in the
 * panel, where there is room to price it.
 */
export function drawStub(
  graphics: Graphics,
  from: { lane: number; depth: number },
  toLane: number,
  colour: number,
): void {
  const x1 = nodeX(from.lane);
  const y1 = nodeY(from.depth);
  const x2 = nodeX(toLane);
  const y2 = nodeY(from.depth + 1);

  const towards = Math.sign(y2 - y1);
  const start = y1 + towards * (NODE_RADIUS + 3);
  const stop = y2 - towards * (NODE_RADIUS + 1);

  if (x1 === x2) {
    graphics.moveTo(x1, start).lineTo(x2, stop);
  } else {
    graphics
      .moveTo(x1, start)
      .lineTo(x1, start + towards * BEND * 0.4)
      .bezierCurveTo(x1, stop, x2, start, x2, stop);
  }

  graphics.stroke({ width: EDGE_WIDTH, color: colour, alpha: 0.38, cap: "round" });
  graphics.circle(x2, y2, NODE_RADIUS - 4).stroke({ width: 2, color: colour, alpha: 0.55 });
}

/**
 * A dashed vertical run, drawn by hand because Pixi 8 strokes are solid.
 *
 * The caller strokes: every dash of a lane shares one colour and width, and one
 * stroke call for the whole lane is both cheaper and visually consistent.
 */
export function dashedLine(graphics: Graphics, x: number, y1: number, y2: number): void {
  const span = y2 - y1;
  const towards = Math.sign(span);
  if (towards === 0) return;

  const period = DASH + DASH_GAP;
  for (let travelled = 0; travelled < Math.abs(span); travelled += period) {
    const from = y1 + towards * travelled;
    const to = y1 + towards * Math.min(travelled + DASH, Math.abs(span));
    graphics.moveTo(x, from).lineTo(x, to);
  }
}

const DASH = 13;
const DASH_GAP = 9;
