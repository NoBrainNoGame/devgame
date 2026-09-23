import type { SfxId } from "@/game/audio/sfx";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { SkipFlag } from "@/game/chips/fx/skip";

/**
 * One sound, in its place in the sequence. Takes no time; a skipped batch
 * plays nothing, because a sound with no picture is noise.
 */
export class Sfx extends booyah.ChipBase {
  constructor(
    private readonly id: SfxId,
    private readonly skip: SkipFlag,
  ) {
    super();
  }

  protected _onActivate(): void {
    if (!this.skip.value) sceneContext(this.chipContext).audio.play(this.id);
    this.terminate();
  }
}
