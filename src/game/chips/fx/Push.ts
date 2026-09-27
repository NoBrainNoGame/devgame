import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";
import type { NodeId } from "@/game/core/types";

/**
 * Local commits reach the remote.
 *
 * Like a reveal, the effect is one line — the set changes and the graph
 * animates it — and the hold is what lets the fill-in be seen. With `into`,
 * the commits slide into that one first: pushed together, squashed into one.
 */
export class Push extends booyah.ChipBase {
  private elapsed = 0;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly into: NodeId | null,
    private readonly y: number,
    private readonly duration: number,
    private readonly skip: SkipFlag,
  ) {
    super();
  }

  protected _onActivate(): void {
    const { reveal, controls } = sceneContext(this.chipContext);
    if (this.into === null) {
      for (const id of this.nodeIds) reveal.push(id);
    } else {
      reveal.absorb(this.nodeIds, this.into);
    }
    controls.camera?.focusOn(this.y);
  }

  protected _onTick(): void {
    const { reducedMotion } = sceneContext(this.chipContext);
    this.elapsed += this._lastTickInfo.timeSinceLastTick;
    if (this.skip.value || reducedMotion || this.elapsed >= this.duration) this.terminate();
  }
}
