import * as booyah from "@/game/chips/booyah";

/**
 * Shared by every effect in a batch, so a single click can cut the whole
 * sequence short.
 *
 * Why a flag rather than draining the queue: Booyah's `Queue.next()` terminates
 * whatever is running, and it throws if that chip has already finished — which
 * is exactly what happens when you call it in a loop. Letting each effect
 * finish itself is both correct and the only way to skip something that has not
 * started yet.
 */
export interface SkipFlag {
  value: boolean;
}

/** A pause the player can cut short. `booyah.Wait` cannot be interrupted. */
export class Beat extends booyah.ChipBase {
  private elapsed = 0;

  constructor(
    private readonly duration: number,
    private readonly skip: SkipFlag,
  ) {
    super();
  }

  protected _onTick(): void {
    this.elapsed += this._lastTickInfo.timeSinceLastTick;
    if (this.skip.value || this.elapsed >= this.duration) this.terminate();
  }
}
