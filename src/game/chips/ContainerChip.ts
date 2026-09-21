import { Container } from "pixi.js";

import * as booyah from "@/game/chips/booyah";

/**
 * A composite that owns a Pixi container and hands it to its children.
 *
 * This is the pattern the whole scene is built from: a chip's display objects
 * live in its own container, so terminating the chip removes exactly what it
 * drew and nothing else. Without it, cleaning up a scene means remembering
 * every sprite you added, which nobody ever does completely.
 */
export abstract class ContainerChip<
  Events extends booyah.BaseCompositeEvents = booyah.BaseCompositeEvents,
> extends booyah.Composite<Events> {
  protected _container!: Container;

  get chipContext(): { readonly container: Container } & Readonly<Record<string, unknown>> {
    return super.chipContext as { readonly container: Container } & Readonly<
      Record<string, unknown>
    >;
  }

  get defaultChildChipContext(): { container: Container } {
    return { container: this._container };
  }

  activate(
    tickInfo: booyah.TickInfo,
    chipContext: booyah.ChipContext,
    inputSignal?: booyah.Signal,
    reloadMemento?: booyah.ReloadMemento,
  ): void {
    this._container = new Container();

    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);

    this.chipContext.container.addChild(this._container);
  }

  terminate(outputSignal?: booyah.Signal): void {
    super.terminate(outputSignal);

    this.chipContext.container.removeChild(this._container);
    this._container.destroy({ children: true });
  }
}
