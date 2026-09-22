import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";
import type { NodeId } from "@/game/core/types";

/**
 * A commit appears, and the camera goes to it.
 *
 * The reveal itself is one line — the set changes, the graph redraws — and
 * the hold after it is what makes a turn of three commits read as three
 * things happening rather than as the graph suddenly being longer.
 */
export class Reveal extends booyah.ChipBase {
  private elapsed = 0;

  constructor(
    private readonly nodeId: NodeId,
    private readonly y: number,
    private readonly asHead: boolean,
    private readonly duration: number,
    private readonly skip: SkipFlag,
  ) {
    super();
  }

  protected _onActivate(): void {
    const { reveal, controls } = sceneContext(this.chipContext);
    reveal.showNode(this.nodeId, this.asHead);
    controls.camera?.focusOn(this.y);
  }

  protected _onTick(): void {
    const { reducedMotion } = sceneContext(this.chipContext);
    this.elapsed += this._lastTickInfo.timeSinceLastTick;
    if (this.skip.value || reducedMotion || this.elapsed >= this.duration) this.terminate();
  }
}
