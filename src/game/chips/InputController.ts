import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { FxQueue } from "@/game/chips/FxQueue";
import type { GraphView } from "@/game/chips/GraphView";

/**
 * What the graph does when you point at it.
 *
 * Hovering a commit explains it; clicking one does nothing. The graph is a
 * record of what happened, and you cannot act on the past — every decision is
 * made in the panel, where there is room to say what each option costs and what
 * it is likely to do. A node you could click would be a second, worse copy of
 * that interface, and it would have to exist before you committed to it, which
 * is precisely what the graph is not allowed to show.
 *
 * A click anywhere still skips the animation: the commonest reason to click
 * during a sequence is impatience.
 */
export class InputController extends booyah.ChipBase {
  constructor(
    private readonly graph: GraphView,
    private readonly fx: FxQueue,
  ) {
    super();
  }

  protected _onActivate(): void {
    const { app } = sceneContext(this.chipContext);

    this._subscribe(this.graph, "nodeHover", (...args: unknown[]) => {
      const nodeId = (args[0] as string | null) ?? null;
      gameStore.setState({
        hoveredNodeId: nodeId,
        hoveredAt: nodeId === null ? null : this.graph.screenPositionOf(nodeId),
      });
    });

    // A click skips the sequence in the game. A run that is only looked at
    // keeps its click for whatever the page does with it.
    if (!sceneContext(this.chipContext).interactive) return;
    this._subscribe(app.canvas, "pointerdown", () => {
      if (gameStore.getState().pendingAnimation) this.fx.skip();
    });
  }

  protected _onTerminate(): void {
    gameStore.setState({ hoveredNodeId: null, hoveredAt: null });
  }
}
