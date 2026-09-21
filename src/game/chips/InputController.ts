import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { FxQueue } from "@/game/chips/FxQueue";
import type { GraphView } from "@/game/chips/GraphView";

/**
 * Turns pointer events on the graph into intentions.
 *
 * Clicking a node the player may step to moves there. Clicking anything else
 * while the canvas is busy skips the animation — the most common reason to
 * click during a sequence is impatience, so that is what a stray click does.
 */
export class InputController extends booyah.ChipBase {
  constructor(
    private readonly graph: GraphView,
    private readonly fx: FxQueue,
  ) {
    super();
  }

  protected _onActivate(): void {
    const { session, app } = sceneContext(this.chipContext);

    this._subscribe(this.graph, "nodeHover", (...args: unknown[]) => {
      gameStore.setState({ hoveredNodeId: (args[0] as string | null) ?? null });
    });

    this._subscribe(this.graph, "nodeTap", (...args: unknown[]) => {
      const nodeId = args[0] as string | undefined;
      if (nodeId === undefined) return;

      if (gameStore.getState().pendingAnimation) {
        this.fx.skip();
        return;
      }

      const result = session.dispatch({ type: "move", nodeId });
      if (!result.ok) gameStore.setState({ lastError: result.reason });
    });

    this._subscribe(app.canvas, "pointerdown", () => {
      if (gameStore.getState().pendingAnimation) this.fx.skip();
    });
  }

  protected _onTerminate(): void {
    gameStore.setState({ hoveredNodeId: null });
  }
}
