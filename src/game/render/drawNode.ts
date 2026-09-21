import type { Graphics } from "pixi.js";

import type { MapNode } from "@/game/core/types";
import { laneColour, NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * One commit, drawn as a ring whose fill says what happened there and whose
 * outline says whether you may go.
 *
 * An unreviewed machine-written commit keeps a second, warmer ring. The design
 * asks for those to be visible on the graph — it is the only way the player can
 * see what a review would clean up before spending a turn on it.
 */
export function drawNode(graphics: Graphics, node: MapNode, hovered: boolean): void {
  graphics.clear();

  const fill = fillFor(node);
  const outline = outlineFor(node, hovered);

  graphics.circle(0, 0, NODE_RADIUS).fill(fill);

  if (outline !== null) {
    graphics.circle(0, 0, NODE_RADIUS).stroke({ width: hovered ? 3 : 2, color: outline });
  }

  if (node.commit?.mode === "ai" && node.commit.reviewed === false) {
    graphics.circle(0, 0, NODE_RADIUS + 4).stroke({ width: 1.5, color: THEME.node.unreviewed });
  }
}

function fillFor(node: MapNode): number {
  if (node.status === "done") {
    return node.commit?.mode === "ai" ? THEME.node.doneAi : THEME.node.doneCraft;
  }
  return THEME.node.locked;
}

function outlineFor(node: MapNode, hovered: boolean): number | null {
  if (node.status === "current") return THEME.node.current;
  if (node.status === "candidate") return THEME.node.candidate;
  if (hovered) return THEME.node.current;
  if (node.status === "done") return null;
  return laneColour(node.lane, node.kind);
}
