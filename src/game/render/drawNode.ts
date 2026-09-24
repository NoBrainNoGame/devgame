import type { Graphics } from "pixi.js";

import { devColourIndex } from "@/game/content";
import type { MapNode } from "@/game/core/types";
import { palette } from "@/game/render/palette";
import { DEV_COLOURS, NODE_RADIUS } from "@/game/render/theme";

/**
 * One commit: a small disc on its lane, the way a git client draws them. The
 * fill says who wrote it — you, or the machine on your behalf — and the rim
 * separates it from the lane running underneath.
 *
 * An unreviewed machine-written commit keeps a second, warmer ring. The design
 * asks for those to be visible on the graph, because it is the only way to see
 * what a review would clean up before spending a turn on it. Merges and trunk
 * commits are hollow, as `git log --graph` draws the ones that carry no work.
 * A colleague's commit is hollow too, in that colleague's own colour: work
 * on the graph that is not yours to stand on, and whose it is at a glance.
 */
export function drawCommit(graphics: Graphics, node: MapNode, hovered: boolean): void {
  graphics.clear();

  const work = node.lane >= 2;
  const fill = node.commit.mode === "ai" ? palette.node.ai : palette.node.craft;

  if (node.commit.bugged === true) {
    graphics.circle(0, 0, NODE_RADIUS + 3).stroke({ width: 2, color: palette.lane.hotfix });
  } else if (node.commit.mode === "ai" && node.commit.reviewed === false) {
    graphics.circle(0, 0, NODE_RADIUS + 3).stroke({ width: 1.5, color: palette.node.unreviewed });
  }

  if (work && node.commit.author !== undefined) {
    graphics
      .circle(0, 0, NODE_RADIUS - 1)
      .fill(palette.background)
      .stroke({
        width: 2,
        color: DEV_COLOURS[devColourIndex(node.commit.author)] ?? palette.node.craft,
      });
  } else if (work) {
    graphics.circle(0, 0, NODE_RADIUS).fill(fill).stroke({ width: 2, color: palette.background });
  } else {
    graphics
      .circle(0, 0, NODE_RADIUS - 1)
      .fill(palette.background)
      .stroke({ width: 2, color: node.lane === 0 ? palette.lane.trunk : palette.lane.dev });
  }

  if (hovered) {
    graphics
      .circle(0, 0, NODE_RADIUS + 5)
      .stroke({ width: 1.5, color: palette.player, alpha: 0.7 });
  }
}
