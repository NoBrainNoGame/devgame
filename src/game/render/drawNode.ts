import type { Graphics } from "pixi.js";

import type { MapNode } from "@/game/core/types";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * One commit: a small disc on its lane, the way a git client draws them. The
 * fill says who wrote it — you, or the machine on your behalf — and the rim
 * separates it from the lane running underneath.
 *
 * An unreviewed machine-written commit keeps a second, warmer ring. The design
 * asks for those to be visible on the graph, because it is the only way to see
 * what a review would clean up before spending a turn on it. Merges and trunk
 * commits are hollow, as `git log --graph` draws the ones that carry no work.
 */
export function drawCommit(graphics: Graphics, node: MapNode, hovered: boolean): void {
  graphics.clear();

  const work = node.lane >= 2;
  const fill = node.commit.mode === "ai" ? THEME.node.ai : THEME.node.craft;

  if (node.commit.bugged === true) {
    graphics.circle(0, 0, NODE_RADIUS + 3).stroke({ width: 2, color: THEME.lane.hotfix });
  } else if (node.commit.mode === "ai" && node.commit.reviewed === false) {
    graphics.circle(0, 0, NODE_RADIUS + 3).stroke({ width: 1.5, color: THEME.node.unreviewed });
  }

  if (work) {
    graphics.circle(0, 0, NODE_RADIUS).fill(fill).stroke({ width: 2, color: THEME.background });
  } else {
    graphics
      .circle(0, 0, NODE_RADIUS - 1)
      .fill(THEME.background)
      .stroke({ width: 2, color: node.lane === 0 ? THEME.lane.trunk : THEME.lane.dev });
  }

  if (hovered) {
    graphics.circle(0, 0, NODE_RADIUS + 5).stroke({ width: 1.5, color: THEME.player, alpha: 0.7 });
  }
}
