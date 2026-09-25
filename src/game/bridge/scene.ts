"use client";

import { Application } from "pixi.js";

import type { AudioService } from "@/game/audio/AudioService";
import { RevealSet } from "@/game/bridge/reveal";
import type { SceneInstance, SceneReport } from "@/game/bridge/sceneGuard";
import type { GameSession } from "@/game/bridge/session";
import * as booyah from "@/game/chips/booyah";
import type { SceneControls } from "@/game/chips/context";
import { GameRoot } from "@/game/chips/GameRoot";
import type { I18nText } from "@/game/core/i18n";
import { THEME } from "@/game/render/theme";

/**
 * The picture of a run: a Pixi application, its Booyah loop and its reveal
 * set, built around a session that outlives it. `mountGame` builds one, and
 * builds another whenever this one fails (`sceneGuard.ts`).
 */

export interface SceneOptions {
  translate: (text: I18nText) => string;
  reducedMotion: boolean;
  interactive: boolean;
  subjects: boolean;
  pops: boolean;
  playerName: string;
  transparent: boolean;
  austerityOverride: number | null;
  audio: AudioService;
  /** The handle's box: the scene fills it in and empties it on the way out. */
  controls: SceneControls;
}

export interface PixiScene extends SceneInstance {
  resize(width: number, height: number): void;
}

/** Canvas2D redraws every pixel every frame: past this density it only costs. */
const CANVAS_MAX_RESOLUTION = 2;

export async function buildPixiScene(
  element: HTMLElement,
  session: GameSession,
  options: SceneOptions,
  mode: SceneInstance["mode"],
  report: SceneReport,
): Promise<PixiScene> {
  const abort = new AbortController();
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const app = new Application();
  try {
    await app.init({
      // WebGL, then Canvas2D if the browser has no WebGL at all — never
      // WebGPU, whose device loss would go unnoticed by the guard.
      preference: mode === "canvas" ? "canvas" : ["webgl", "canvas"],
      resizeTo: element,
      // A transparent canvas clears to premultiplied black: a colour with an
      // alpha of zero would still be added to the page underneath.
      background: options.transparent ? 0x000000 : THEME.background,
      backgroundAlpha: options.transparent ? 0 : 1,
      antialias: true,
      resolution: mode === "canvas" ? Math.min(ratio, CANVAS_MAX_RESOLUTION) : ratio,
      autoDensity: true,
      // Booyah owns the loop. Two tickers would render twice per frame and drift.
      autoStart: false,
      sharedTicker: false,
    });
  } catch (error) {
    try {
      app.destroy(true);
    } catch {
      // Half-built: nothing more to free.
    }
    throw error;
  }

  const actual: SceneInstance["mode"] = app.renderer.name === "canvas" ? "canvas" : "webgl";
  const canvas = app.canvas;
  element.appendChild(canvas);
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.dataset.devgameRenderer = actual;
  canvas.addEventListener("webglcontextlost", () => report("context_lost"), {
    signal: abort.signal,
  });

  // Nothing of the run is animated on a new picture: everything it wrote is
  // there from the first frame.
  const reveal = new RevealSet();
  reveal.showAll(session.getState());

  // Canvas2D is the fallback: it draws the run as it stands, and nothing is
  // ever waited for.
  const degraded = actual === "canvas";
  const runner = new booyah.Runner(() => new GameRoot(), {
    rootContext: {
      app,
      session,
      reveal,
      translate: options.translate,
      reducedMotion: options.reducedMotion || degraded,
      interactive: options.interactive,
      subjects: options.subjects,
      pops: options.pops && !degraded,
      playerName: options.playerName,
      controls: options.controls,
      austerityOverride: options.austerityOverride,
      audio: options.audio,
      signal: abort.signal,
      fault: (error: unknown) => {
        console.error("The scene failed in a frame and is being rebuilt:", error);
        report("frame");
      },
    },
    minFps: 10,
  });

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    // First, before Pixi tears its context down: `destroy()` loses the
    // context on purpose, and our own listener must not take it for a crash.
    abort.abort();
    try {
      if (runner.isRunning) runner.stop();
    } catch {
      // A loop stopped by a throw still says it runs; there is nothing to stop.
    }
    session.detachListeners();
    try {
      app.destroy(true, { children: true });
    } catch {
      // A lost context can make Pixi's own teardown throw; the canvas goes anyway.
    }
    canvas.remove();
    options.controls.camera = null;
    options.controls.skip = null;
  };

  try {
    runner.start();
  } catch (error) {
    destroy();
    throw error;
  }

  return {
    mode: actual,
    resize(width, height) {
      if (!destroyed) app.renderer.resize(width, height);
    },
    destroy,
  };
}
