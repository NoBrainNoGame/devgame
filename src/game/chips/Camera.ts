import type { Container } from "pixi.js";

import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { GraphView } from "@/game/chips/GraphView";
import { headOf } from "@/game/core/map/graph";
import { nodeY } from "@/game/render/coords";
import { ZOOM } from "@/game/render/theme";

/**
 * Where the graph sits and how big it is.
 *
 * **Horizontally the camera is not a camera at all.** The tree is always
 * centred: its x comes from the lanes that exist, never from the player. A git
 * graph is one narrow column, and letting it be dragged sideways only ever ends
 * with the history parked off screen for no reason. There is nothing out there
 * to find.
 *
 * Vertically there are two modes. **Following**: the camera eases towards
 * whatever is acting — your head commit, or the effect that just played —
 * which is what lets a machine-written burst of three read as three things
 * happening rather than as the graph suddenly being longer. **Free**: the
 * player has dragged, and the camera stays where they left it.
 *
 * Free lasts until something happens. Dragging is for reading your history
 * between turns, so it survives exactly that long: the next action takes the
 * camera back to whatever is acting. Watching the graph move is how the turn
 * is read, and a player parked elsewhere would see none of it.
 *
 * Zoom is never touched by any of this. The recentre button returns to
 * following and leaves the scale alone, because how close you like to sit is a
 * preference, not a thing that needs correcting.
 */
export class Camera extends booyah.ChipBase {
  private world!: Container;
  private readonly graph: GraphView | null;

  private zoom = ZOOM.default;
  private following = true;

  /**
   * What the camera is looking at, in world units, or null for "the player".
   * An effect borrows it for the length of its animation.
   */
  private focusY: number | null = null;

  private dragging = false;
  private dragMoved = 0;
  private lastY = 0;

  constructor(graph?: GraphView) {
    super();
    this.graph = graph ?? null;
  }

  protected _onActivate(): void {
    const { world, app, session } = sceneContext(this.chipContext);
    this.world = world;
    this.world.scale.set(this.zoom);

    const canvas = app.canvas;

    this._subscribe(canvas, "wheel", (event) => {
      const wheel = event as unknown as WheelEvent;
      wheel.preventDefault();

      // Plain wheel zooms, the way a graph tool does; shift scrolls, for anyone
      // whose hand expects a document.
      if (wheel.shiftKey) {
        this.world.position.y -= wheel.deltaY;
        this.release();
      } else {
        this.zoomBy(wheel.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step, wheel.offsetY);
      }
    });

    this._subscribe(canvas, "pointerdown", (event) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.lastY = (event as unknown as PointerEvent).clientY;
    });
    this._subscribe(canvas, "pointerup", () => {
      this.dragging = false;
    });
    this._subscribe(canvas, "pointerleave", () => {
      this.dragging = false;
    });
    this._subscribe(canvas, "pointermove", (event) => {
      if (!this.dragging) return;

      const y = (event as unknown as PointerEvent).clientY;
      const dy = y - this.lastY;
      this.lastY = y;

      // A few pixels is a shaky click, not a drag. Only a real drag takes the
      // camera off the leash. Sideways movement is ignored outright.
      this.dragMoved += Math.abs(dy);
      if (this.dragMoved < 6) return;

      this.world.position.y += dy;
      this.release();
    });

    this._subscribe(session, "applied", (...args: unknown[]) => {
      const payload = args[0] as { events?: { type: string }[] } | undefined;
      if (payload?.events?.some((event) => event.type === "sprint_started") === true) {
        this.recentre();
      }
    });

    this.snap();
    this.publish();
  }

  protected _onTick(): void {
    const { app, reducedMotion } = sceneContext(this.chipContext);

    // Exponential rather than a fraction of a fixed budget, so the glide takes
    // the same time whatever the frame rate.
    const ease = reducedMotion ? 1 : 1 - Math.exp(-this._lastTickInfo.timeSinceLastTick / GLIDE_MS);

    this.world.scale.set(this.world.scale.x + (this.zoom - this.world.scale.x) * ease);

    // x is never dragged and never follows the player: it holds the tree in the
    // middle, and only moves because a new lane widened the tree.
    this.world.position.x += (this.centredX() - this.world.position.x) * ease;

    if (!this.following) return;

    const target = app.screen.height * FOCUS_Y - this.targetY() * this.zoom;
    this.world.position.y += (target - this.world.position.y) * ease;
  }

  protected _onResize(): void {
    this.snap(!this.following);
  }

  // --- what the scene calls -------------------------------------------------

  /**
   * Look at a point in world space until told otherwise. Passing null hands the
   * camera back to the player.
   *
   * This also ends a free camera. Something is happening and the player asked
   * for it, directly or by taking a turn; showing them somewhere else would be
   * answering a different question.
   */
  focusOn(y: number | null): void {
    this.focusY = y;
    if (this.following) return;
    this.following = true;
    this.publish();
  }

  // --- what the HUD calls ---------------------------------------------------

  zoomIn(): void {
    this.zoomBy(ZOOM.step);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM.step);
  }

  /** Back to following, at whatever zoom the player had chosen. */
  recentre(): void {
    this.following = true;
    this.focusY = null;
    this.publish();
  }

  /** Zooms out until the whole revealed history is on screen. */
  fit(): void {
    const { app } = sceneContext(this.chipContext);
    const bounds = this.graph?.bounds();
    if (bounds === null || bounds === undefined) {
      this.recentre();
      return;
    }

    // Padding so the outermost commits are not flush against the edge, and so
    // their labels have somewhere to go.
    const width = Math.max(1, bounds.maxX - bounds.minX) + 260;
    const height = Math.max(1, bounds.maxY - bounds.minY) + 180;

    this.zoom = clampZoom(Math.min(app.screen.width / width, app.screen.height / height));

    const centreY = (bounds.minY + bounds.maxY) / 2;
    this.world.scale.set(this.zoom);
    this.world.position.set(this.centredX(), app.screen.height / 2 - centreY * this.zoom);

    this.release();
  }

  // --- the maths ------------------------------------------------------------

  /**
   * Zooms about a point on the vertical axis, so whatever is under the cursor
   * stays under it. Horizontally there is nothing to preserve — the tree is
   * centred at every scale.
   */
  private zoomBy(factor: number, atY?: number): void {
    const { app } = sceneContext(this.chipContext);

    const before = this.zoom;
    this.zoom = clampZoom(this.zoom * factor);
    if (this.zoom === before) return;

    // Following means the camera is already driving y; recomputing it here
    // would fight the tick and make the head drift as you zoom.
    if (!this.following) {
      const anchor = atY ?? app.screen.height / 2;
      const worldY = (anchor - this.world.position.y) / before;
      this.world.scale.set(this.zoom);
      this.world.position.y = anchor - worldY * this.zoom;
    }

    this.publish();
  }

  /** Where the world has to sit for the tree's lanes to straddle the middle. */
  private centredX(): number {
    const { app } = sceneContext(this.chipContext);
    const bounds = this.graph?.bounds();
    const middle = bounds === null || bounds === undefined ? 0 : (bounds.minX + bounds.maxX) / 2;
    return app.screen.width / 2 - middle * this.zoom;
  }

  /** The world y the camera wants in the middle of the canvas. */
  private targetY(): number {
    if (this.focusY !== null) return this.focusY;

    // The head as drawn, not as the engine has it: with `focusOn(null)` the
    // camera would otherwise jump to the end of a batch still being played.
    const { session, reveal } = sceneContext(this.chipContext);
    const state = session.getState();
    const head =
      reveal.headId === null ? headOf(state) : (state.nodes[reveal.headId] ?? headOf(state));
    return nodeY(head.depth);
  }

  private snap(keepY = false): void {
    const { app } = sceneContext(this.chipContext);
    const y = keepY
      ? this.world.position.y
      : app.screen.height * FOCUS_Y - this.targetY() * this.zoom;
    this.world.position.set(this.centredX(), y);
  }

  private release(): void {
    this.following = false;
    this.publish();
  }

  private publish(): void {
    gameStore.setState({ zoom: this.zoom, cameraFollowing: this.following });
    // Below about three quarters, labels stop being readable and start being
    // texture; hiding them is what makes zooming out useful at all.
    this.graph?.setLabelsVisible(this.zoom >= 0.75);
  }
}

/**
 * Where the focused node sits down the canvas.
 *
 * Not the exact middle: history runs downwards and there is nothing at all
 * above the head commit, so a little past centre spends the empty half on the
 * part of the graph that has something in it.
 */
const FOCUS_Y = 0.45;

/** Time constant of the glide, in milliseconds. */
const GLIDE_MS = 150;

function clampZoom(value: number): number {
  return Math.max(ZOOM.min, Math.min(ZOOM.max, value));
}
