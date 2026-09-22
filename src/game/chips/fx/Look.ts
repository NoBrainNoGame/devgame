import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";

/**
 * Points the camera at something, and holds there while it happens.
 *
 * A turn is a sequence of things happening in different places: you commit,
 * then production breaks somewhere else. The camera has to go and look at each
 * of them in turn, or an effect is a label sliding somewhere off screen.
 * Passing null hands the camera back to the player.
 *
 * It only asks. A camera the player has dragged stays where they put it.
 */
export class Look extends booyah.ChipBase {
  private elapsed = 0;

  constructor(
    private readonly y: number | null,
    private readonly duration: number,
    private readonly skip: SkipFlag,
  ) {
    super();
  }

  protected _onActivate(): void {
    sceneContext(this.chipContext).controls.camera?.focusOn(this.y);
  }

  protected _onTick(): void {
    const { reducedMotion } = sceneContext(this.chipContext);
    this.elapsed += this._lastTickInfo.timeSinceLastTick;
    if (this.skip.value || reducedMotion || this.elapsed >= this.duration) this.terminate();
  }
}
