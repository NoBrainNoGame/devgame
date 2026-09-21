import type { Container } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { RunScene } from "@/game/chips/RunScene";

/**
 * The root of the chip tree.
 *
 * Pixi's own ticker is switched off in `mountGame`: one loop drives everything,
 * and it is Booyah's. Rendering happens here, after every child has had its
 * tick, so a frame never shows a half-updated scene.
 */
export class GameRoot extends booyah.Composite {
  get defaultChildChipContext(): { container: Container } {
    return { container: sceneContext(this.chipContext).app.stage };
  }

  protected _onActivate(): void {
    this._activateChildChip(new RunScene());
  }

  protected _onAfterTick(): void {
    sceneContext(this.chipContext).app.render();
  }
}
