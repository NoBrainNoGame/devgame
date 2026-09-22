import { Text } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";
import { floatingStyle } from "@/game/render/textStyles";

/**
 * A number that rises and fades where something happened. It is the only way
 * the canvas reports a quantity, so it has to be short: "+2", "−9 dette".
 */
export class Pop extends booyah.ChipBase {
  private label: Text | undefined;
  private elapsed = 0;

  constructor(
    private readonly position: { x: number; y: number },
    private readonly caption: string,
    private readonly colour: number,
    private readonly duration = 650,
    private readonly skip: SkipFlag = { value: false },
  ) {
    super();
  }

  protected _onActivate(): void {
    const { world, reducedMotion } = sceneContext(this.chipContext);
    // Skipped before it started: nothing to draw, not even for a frame.
    if (this.skip.value) return;

    this.label = new Text({ text: this.caption, style: floatingStyle });
    this.label.tint = this.colour;
    this.label.anchor.set(0.5, 1);
    this.label.position.set(this.position.x, this.position.y - 14);
    world.addChild(this.label);

    if (reducedMotion) this.elapsed = this.duration;
  }

  protected _onTick(): void {
    if (this.skip.value || this.label === undefined) {
      this.terminate();
      return;
    }

    this.elapsed += this._lastTickInfo.timeSinceLastTick;

    const progress = Math.min(1, this.elapsed / this.duration);
    this.label.y = this.position.y - 14 - progress * 22;
    this.label.alpha = 1 - progress * progress;

    if (progress >= 1) this.terminate();
  }

  protected _onTerminate(): void {
    this.label?.destroy();
  }
}
