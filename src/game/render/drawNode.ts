import type { Graphics } from "pixi.js";

import type { MapNode } from "@/game/core/types";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * One commit.
 *
 * A filled disc with a darker rim, the way a desktop git client draws them: the
 * fill says who wrote it — you, or the machine on your behalf — and the rim
 * separates it from the lane running underneath.
 *
 * An unreviewed machine-written commit keeps a second, warmer ring. The design
 * asks for those to be visible on the graph, because it is the only way to see
 * what a review would clean up before spending a turn on it.
 */
export function drawCommit(graphics: Graphics, node: MapNode, hovered: boolean): void {
  graphics.clear();

  const fill = node.commit?.mode === "ai" ? THEME.node.ai : THEME.node.craft;

  if (node.commit?.mode === "ai" && node.commit.reviewed === false) {
    graphics.circle(0, 0, NODE_RADIUS + 5).stroke({ width: 2, color: THEME.node.unreviewed });
  }

  graphics.circle(0, 0, NODE_RADIUS).fill(fill).stroke({ width: 3, color: THEME.background });

  if (hovered) {
    graphics.circle(0, 0, NODE_RADIUS + 8).stroke({ width: 2, color: THEME.player, alpha: 0.7 });
  }
}
