import { Container, Graphics } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { nodeX, nodeY } from "@/game/render/coords";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * The ring around `HEAD`. The label itself is a ref pill in the gutter, with
 * the others; this is the thing on the graph that says where you stand.
 *
 * It sits on the **last commit written**, never on the one about to be. In git
 * you stand on history, not on a plan: the node you are about to write does not
 * exist until you write it, so there is nothing there to stand on.
 *
 * It eases to its target rather than jumping, so a turn that writes several
 * commits reads as a movement along the branch instead of a teleport.
 */
export class PlayerMarker extends booyah.ChipBase {
  private root!: Container;
  private ring!: Graphics;
  private x = 0;
  private y = 0;
  private placed = false;

  protected _onActivate(): void {
    const { world } = sceneContext(this.chipContext);

    this.root = new Container();
    this.ring = new Graphics();
    this.ring.circle(0, 0, NODE_RADIUS + 4).stroke({ width: 2, color: THEME.player });

    this.root.addChild(this.ring);
    world.addChild(this.root);
  }

  protected _onTick(): void {
    const { session, reveal, reducedMotion } = sceneContext(this.chipContext);
    const node = reveal.headId === null ? undefined : session.getState().nodes[reveal.headId];
    if (node === undefined) return;

    const targetX = nodeX(node.lane);
    const targetY = nodeY(node.depth);

    const ease =
      this.placed && !reducedMotion ? Math.min(1, this._lastTickInfo.timeSinceLastTick / 110) : 1;

    this.x += (targetX - this.x) * ease;
    this.y += (targetY - this.y) * ease;
    this.placed = true;

    this.root.position.set(this.x, this.y);
  }

  protected _onTerminate(): void {
    this.root.destroy({ children: true });
  }
}
