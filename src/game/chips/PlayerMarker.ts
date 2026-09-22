import { Container, Graphics, Text } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { headOf } from "@/game/core/map/graph";
import { nodeX, nodeY } from "@/game/render/coords";
import { cursorStyle } from "@/game/render/textStyles";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * `HEAD`, labelled the way a git client labels it.
 *
 * It sits on the **last commit written**, never on the one about to be. In git
 * you stand on history, not on a plan: the node you are about to write does not
 * exist until you write it, so there is nothing there to stand on.
 *
 * It eases to its target rather than jumping, so a machine-written burst that
 * walks three commits reads as a movement along the branch instead of a
 * teleport to the end of it.
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
    this.ring.circle(0, 0, NODE_RADIUS + 7).stroke({ width: 2.5, color: THEME.player });

    const label = new Text({ text: "HEAD", style: cursorStyle });
    label.anchor.set(1, 0.5);
    label.x = -NODE_RADIUS - 16;
    label.alpha = 0.85;

    const chip = new Graphics();
    chip
      .roundRect(-NODE_RADIUS - 20 - label.width - 8, -11, label.width + 16, 22, 11)
      .fill({ color: THEME.background, alpha: 0.92 })
      .stroke({ width: 1.5, color: THEME.player, alpha: 0.5 });

    this.root.addChild(this.ring, chip, label);
    world.addChild(this.root);
  }

  protected _onTick(): void {
    const { session, reducedMotion } = sceneContext(this.chipContext);
    const node = headOf(session.getState());

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
