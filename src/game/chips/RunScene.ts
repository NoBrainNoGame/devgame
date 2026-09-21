import { Container } from "pixi.js";

import { BotCursors } from "@/game/chips/BotCursors";
import * as booyah from "@/game/chips/booyah";
import { Camera } from "@/game/chips/Camera";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import { FxQueue } from "@/game/chips/FxQueue";
import { GraphView } from "@/game/chips/GraphView";
import { InputController } from "@/game/chips/InputController";
import { PlayerMarker } from "@/game/chips/PlayerMarker";

/**
 * Everything drawn for a run, under one camera.
 *
 * The children run in parallel and never talk to each other: the graph draws,
 * the cursors draw, the effects play, and the camera moves. What they share is
 * the run state, which only the session writes.
 */
export class RunScene extends ContainerChip {
  private world!: Container;

  get defaultChildChipContext(): { container: Container; world: Container } {
    return { container: this.world, world: this.world };
  }

  protected _onActivate(): void {
    this.world = new Container();
    this._container.addChild(this.world);

    const graph = new GraphView();
    const fx = new FxQueue();
    const camera = new Camera(graph);
    sceneContext(this.chipContext).controls.camera = camera;

    this._activateChildChip(
      new booyah.Parallel(
        [camera, graph, new BotCursors(), new PlayerMarker(), fx, new InputController(graph, fx)],
        { terminateOnCompletion: false },
      ),
    );
  }
}
