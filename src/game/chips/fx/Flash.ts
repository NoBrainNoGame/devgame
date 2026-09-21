import { Graphics } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";
import { NODE_RADIUS } from "@/game/render/theme";

/** A ring that expands and fades: something went wrong here. */
export class Flash extends booyah.ChipBase {
  private ring!: Graphics;
  private elapsed = 0;

  constructor(
    private readonly position: { x: number; y: number },
    private readonly colour: number,
    private readonly duration = 420,
    private readonly skip: SkipFlag = { value: false },
  ) {
    super();
  }

  protected _onActivate(): void {
    const { world, reducedMotion } = sceneContext(this.chipContext);

    this.ring = new Graphics();
    this.ring.position.set(this.position.x, this.position.y);
    world.addChild(this.ring);

    if (reducedMotion) this.elapsed = this.duration;
  }

  protected _onTick(): void {
    if (this.skip.value) {
      this.terminate();
      return;
    }

    this.elapsed += this._lastTickInfo.timeSinceLastTick;
    const progress = Math.min(1, this.elapsed / this.duration);

    this.ring.clear();
    this.ring
      .circle(0, 0, NODE_RADIUS + 4 + progress * 18)
      .stroke({ width: 3, color: this.colour, alpha: 1 - progress });

    if (progress >= 1) this.terminate();
  }

  protected _onTerminate(): void {
    this.ring.destroy();
  }
}
