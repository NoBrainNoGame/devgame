import type { BranchRefs } from "@/game/chips/BranchRefs";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { GraphView } from "@/game/chips/GraphView";
import type { PlayerMarker } from "@/game/chips/PlayerMarker";
import { austerityOf } from "@/game/core/rules/tier";
import { palette, setAusterity } from "@/game/render/palette";

/** How long the canvas takes to slide from one look to the next. */
const SLIDE_MS = 600;

/**
 * Keeps the canvas's palette on the run's austerity. The value the engine
 * reports moves in small steps as the money comes in; the chip eases the
 * palette towards it over a moment rather than posting it, so a payday that
 * crosses a threshold reads as the light changing, not as a switch. A QA
 * override (`?austerity=`) is honoured when the page sets one.
 */
export class Austerity extends booyah.ChipBase {
  private current = 0;

  constructor(
    private readonly graph: GraphView,
    private readonly refs: BranchRefs,
    private readonly marker: PlayerMarker,
  ) {
    super();
  }

  protected _onActivate(): void {
    this.current = this.target();
    this.apply();
  }

  protected _onTick(): void {
    const target = this.target();
    if (Math.abs(target - this.current) < 0.001) return;
    const { reducedMotion } = sceneContext(this.chipContext);
    const step = reducedMotion ? 1 : Math.min(1, this._lastTickInfo.timeSinceLastTick / SLIDE_MS);
    this.current += (target - this.current) * step;
    if (Math.abs(target - this.current) < 0.001) this.current = target;
    this.apply();
  }

  private target(): number {
    const { session, austerityOverride } = sceneContext(this.chipContext);
    if (austerityOverride !== undefined && austerityOverride !== null) return austerityOverride;
    return austerityOf(session.getState().moneyEarned);
  }

  private apply(): void {
    const { app } = sceneContext(this.chipContext);
    setAusterity(this.current);
    app.renderer.background.color = palette.background;
    this.graph.restyle();
    this.refs.restyle();
    this.marker.restyle();
  }
}
