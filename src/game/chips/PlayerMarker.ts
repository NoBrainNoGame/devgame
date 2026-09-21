import { Graphics } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { nodeX, nodeY } from "@/game/render/coords";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * Where you are. It eases to the player's node rather than jumping, so a
 * machine-written burst that walks three nodes reads as a movement instead of
 * a teleport.
 */
export class PlayerMarker extends booyah.ChipBase {
  private ring!: Graphics;
  private x = 0;
  private y = 0;
  private placed = false;

  protected _onActivate(): void {
    const { world } = sceneContext(this.chipContext);

    this.ring = new Graphics();
    this.ring.circle(0, 0, NODE_RADIUS + 6).stroke({ width: 2.5, color: THEME.player });
    world.addChild(this.ring);
  }

  protected _onTick(): void {
    const { session, reducedMotion } = sceneContext(this.chipContext);
    const state = session.getState();
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) return;

    const targetX = nodeX(node.lane);
    const targetY = nodeY(node.depth);

    const ease =
      this.placed && !reducedMotion ? Math.min(1, this._lastTickInfo.timeSinceLastTick / 90) : 1;

    this.x += (targetX - this.x) * ease;
    this.y += (targetY - this.y) * ease;
    this.placed = true;

    this.ring.position.set(this.x, this.y);
  }

  protected _onTerminate(): void {
    this.ring.destroy();
  }
}
