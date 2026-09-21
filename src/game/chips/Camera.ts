import type { Container } from "pixi.js";

import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { GraphView } from "@/game/chips/GraphView";
import { nodeX, nodeY } from "@/game/render/coords";
import { ZOOM } from "@/game/render/theme";

/**
 * Where the graph sits and how big it is.
 *
 * Two modes, and only two. **Following**: the camera eases towards the head
 * commit every frame, which is what lets a machine-written burst of three read
 * as three things happening rather than as the graph suddenly being longer.
 * **Free**: the player has dragged or zoomed, and the camera does exactly what
 * they left it doing.
 *
 * Free stays free. Someone who scrolled down to read their history did not want
 * to be yanked back by the next commit. It is only taken back automatically
 * when a sprint starts, where the old view means nothing, and by the recentre
 * button.
 */
export class Camera extends booyah.ChipBase {
  private world!: Container;
  private readonly graph: GraphView | null;

  private zoom = ZOOM.default;
  private following = true;

  private dragging = false;
  private dragMoved = 0;
  private last = { x: 0, y: 0 };

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
        this.zoomBy(wheel.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step, {
          x: wheel.offsetX,
          y: wheel.offsetY,
        });
      }
    });

    this._subscribe(canvas, "pointerdown", (event) => {
      this.dragging = true;
      this.dragMoved = 0;
      const pointer = event as unknown as PointerEvent;
      this.last = { x: pointer.clientX, y: pointer.clientY };
    });
    this._subscribe(canvas, "pointerup", () => {
      this.dragging = false;
    });
    this._subscribe(canvas, "pointerleave", () => {
      this.dragging = false;
    });
    this._subscribe(canvas, "pointermove", (event) => {
      if (!this.dragging) return;
      const pointer = event as unknown as PointerEvent;

      const dx = pointer.clientX - this.last.x;
      const dy = pointer.clientY - this.last.y;
      this.last = { x: pointer.clientX, y: pointer.clientY };

      // A few pixels is a shaky click, not a drag. Only a real drag takes the
      // camera off the leash.
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved < 6) return;

      this.world.position.set(this.world.position.x + dx, this.world.position.y + dy);
      this.release();
    });

    this._subscribe(session, "applied", (...args: unknown[]) => {
      const payload = args[0] as { events?: { type: string }[] } | undefined;
      if (payload?.events?.some((event) => event.type === "sprint_started") === true) {
        this.recentre();
      }
    });

    this.snapToHead();
    this.publish();
  }

  protected _onTick(): void {
    if (!this.following) return;

    const { reducedMotion } = sceneContext(this.chipContext);
    const ease = reducedMotion ? 1 : Math.min(1, this._lastTickInfo.timeSinceLastTick / 120);

    const target = this.headPosition();
    if (target === null) return;

    this.world.scale.set(this.world.scale.x + (this.zoom - this.world.scale.x) * ease);
    this.world.position.set(
      this.world.position.x + (target.x - this.world.position.x) * ease,
      this.world.position.y + (target.y - this.world.position.y) * ease,
    );
  }

  protected _onResize(): void {
    if (this.following) this.snapToHead();
  }

  // --- what the HUD calls ---------------------------------------------------

  zoomIn(): void {
    this.zoomBy(ZOOM.step);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM.step);
  }

  /** Back to following the head commit, at the default zoom. */
  recentre(): void {
    this.zoom = ZOOM.default;
    this.following = true;
    this.world.scale.set(this.zoom);
    this.snapToHead();
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
    this.world.scale.set(this.zoom);

    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    this.world.position.set(
      app.screen.width / 2 - centreX * this.zoom,
      app.screen.height / 2 - centreY * this.zoom,
    );

    this.release();
  }

  // --- the maths ------------------------------------------------------------

  /** Zooms about a screen point, so whatever is under the cursor stays there. */
  private zoomBy(factor: number, at?: { x: number; y: number }): void {
    const { app } = sceneContext(this.chipContext);
    const anchor = at ?? { x: app.screen.width / 2, y: app.screen.height / 2 };

    const before = this.world.scale.x;
    this.zoom = clampZoom(this.zoom * factor);
    if (this.zoom === before) return;

    const worldX = (anchor.x - this.world.position.x) / before;
    const worldY = (anchor.y - this.world.position.y) / before;

    this.world.scale.set(this.zoom);
    this.world.position.set(anchor.x - worldX * this.zoom, anchor.y - worldY * this.zoom);

    this.release();
  }

  private headPosition(): { x: number; y: number } | null {
    const { app, session } = sceneContext(this.chipContext);
    const state = session.getState();
    const head = state.nodes[state.player.nodeId];
    if (head === undefined) return null;

    // The head sits a third of the way down: history is below it and there is
    // nothing above it yet, so the room belongs underneath.
    //
    // Horizontally the trunk sits about a third in, not centred. A git graph is
    // a narrow vertical column with a wide list of subjects beside it — every
    // desktop client is laid out this way — and centring the column would leave
    // the labels crammed against one edge and half the canvas empty.
    return {
      x: app.screen.width * TRUNK_X - nodeX(head.lane) * this.zoom,
      y: app.screen.height * 0.34 - nodeY(head.depth) * this.zoom,
    };
  }

  private snapToHead(): void {
    const target = this.headPosition();
    if (target !== null) this.world.position.set(target.x, target.y);
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

/** Where the trunk sits across the canvas, as a fraction of its width. */
const TRUNK_X = 0.34;

function clampZoom(value: number): number {
  return Math.max(ZOOM.min, Math.min(ZOOM.max, value));
}
