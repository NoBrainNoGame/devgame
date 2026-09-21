import type { Container } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { nodeX, nodeY } from "@/game/render/coords";
import { DEPTH_HEIGHT } from "@/game/render/theme";

/**
 * Keeps the player's node in view and lets the player look around.
 *
 * It follows by easing rather than snapping: a graph that teleports when a
 * machine-written commit jumps three nodes is unreadable, and the whole point
 * of the canvas is that you can see where you came from.
 */
export class Camera extends booyah.ChipBase {
  private world!: Container;
  private manualOffset = 0;
  private dragging = false;
  private lastPointerY = 0;

  protected _onActivate(): void {
    const { world, app, session } = sceneContext(this.chipContext);
    this.world = world;

    const canvas = app.canvas;
    this._subscribe(canvas, "wheel", (event) => {
      const wheel = event as unknown as WheelEvent;
      wheel.preventDefault();
      this.manualOffset -= wheel.deltaY;
    });
    this._subscribe(canvas, "pointerdown", (event) => {
      this.dragging = true;
      this.lastPointerY = (event as unknown as PointerEvent).clientY;
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
      this.manualOffset += pointer.clientY - this.lastPointerY;
      this.lastPointerY = pointer.clientY;
    });

    // Any action re-centres on the player: dragging is for looking, not for
    // losing your place.
    this._subscribe(session, "applied", () => {
      this.manualOffset = 0;
    });

    this.centre(1);
  }

  protected _onTick(): void {
    const { reducedMotion } = sceneContext(this.chipContext);
    // A tenth of the remaining distance per frame at 60 fps: fast enough to
    // keep up with a jump, slow enough to read.
    const ease = reducedMotion ? 1 : Math.min(1, this._lastTickInfo.timeSinceLastTick / 100);
    this.centre(ease);
  }

  private centre(ease: number): void {
    const { app, session } = sceneContext(this.chipContext);
    const state = session.getState();
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) return;

    // Two thirds down the viewport: what is behind you matters less than what
    // is ahead of you, but it still has to be visible.
    let targetY = app.screen.height * 0.62 - nodeY(node.depth) + this.manualOffset;

    // …except at the top of a sprint, where following that rule would leave
    // half a screen of nothing above the first commit.
    const topMargin = DEPTH_HEIGHT * 1.5;
    const highest = Math.min(...Object.values(state.nodes).map((other) => nodeY(other.depth)));
    targetY = Math.min(targetY, topMargin - highest);

    const targetX = app.screen.width / 2 - nodeX(node.lane) * 0.4;

    this.world.y += (targetY - this.world.y) * ease;
    this.world.x += (targetX - this.world.x) * ease;
  }

  protected _onResize(): void {
    this.centre(1);
  }

  /** Snaps to the player, skipping the ease. Used when a sprint starts. */
  jump(): void {
    this.manualOffset = 0;
    this.centre(1);
  }

  /** How far the viewport can scroll, so a caller can clamp against it. */
  get rowHeight(): number {
    return DEPTH_HEIGHT;
  }
}
