"use client";

import { Application } from "pixi.js";

import { GameSession, type SessionOptions } from "@/game/bridge/session";
import { gameStore, resetGameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { GameRoot } from "@/game/chips/GameRoot";
import type { I18nText } from "@/game/core/i18n";
import type { PlayerAction } from "@/game/core/types";
import type { RunSaveDto } from "@/game/dto/run";
import { THEME } from "@/game/render/theme";

/**
 * Starts a run on a canvas and hands back the only handle the app needs.
 *
 * This is the whole surface between React and the game: React never imports a
 * chip, never touches Pixi, and never sees `RunState`.
 */

export interface MountOptions extends Omit<SessionOptions, "resumeActions"> {
  /** Resolves an engine key. The engine never produces a display string. */
  translate: (text: I18nText) => string;
  /** A previously saved action log, replayed to resume where it left off. */
  resume?: RunSaveDto;
  reducedMotion?: boolean;
}

export interface GameHandle {
  dispatch(action: PlayerAction): { ok: true } | { ok: false; reason: string };
  /** The run so far, ready to persist. */
  save(): RunSaveDto;
  getActions(): PlayerAction[];
  /** Fast-forwards the canvas to the end of the current sequence. */
  skipAnimations(): void;
  resize(): void;
  dispose(): void;
}

declare global {
  var __devgameHandle: GameHandle | undefined;
}

/**
 * Which mount is the live one.
 *
 * React's double-invoked effects start two mounts, and `app.init()` is not
 * guaranteed to settle in the order it was called. Claiming ownership *before*
 * the await is what lets a mount that has since been superseded recognise
 * itself and stay quiet: without it, a slow first mount resolving after a fast
 * second one would publish its own empty board over a run already on screen,
 * and then reset the store when its cleanup ran.
 */
let mountSerial = 0;

export async function mountGame(element: HTMLElement, options: MountOptions): Promise<GameHandle> {
  // A hot reload re-runs this module with the old canvas still on screen.
  globalThis.__devgameHandle?.dispose();

  mountSerial += 1;
  const serial = mountSerial;
  const isCurrent = (): boolean => serial === mountSerial;

  const app = new Application();
  await app.init({
    resizeTo: element,
    background: THEME.background,
    antialias: true,
    resolution: typeof window === "undefined" ? 1 : window.devicePixelRatio,
    autoDensity: true,
    // Booyah owns the loop. Two tickers would render twice per frame and drift.
    autoStart: false,
    sharedTicker: false,
  });

  element.appendChild(app.canvas);
  app.canvas.style.touchAction = "none";
  app.canvas.style.display = "block";

  const session = new GameSession({
    seed: options.seed,
    mode: options.mode,
    profileId: options.profileId,
    meta: options.meta,
    clientRunId: options.clientRunId,
    createdAt: options.createdAt,
    ...(options.resume === undefined ? {} : { resumeActions: options.resume.actions }),
  });

  const runner = new booyah.Runner(() => new GameRoot(), {
    rootContext: {
      app,
      session,
      translate: options.translate,
      reducedMotion: options.reducedMotion ?? false,
    },
    minFps: 10,
  });
  runner.start();

  const observer = new ResizeObserver(() => {
    app.renderer.resize(element.clientWidth, element.clientHeight);
  });
  observer.observe(element);

  let disposed = false;

  const handle: GameHandle = {
    dispatch(action) {
      return session.dispatch(action);
    },
    save() {
      return session.save();
    },
    getActions() {
      return session.getActions();
    },
    skipAnimations() {
      gameStore.setState({ pendingAnimation: false });
    },
    resize() {
      app.renderer.resize(element.clientWidth, element.clientHeight);
    },
    dispose() {
      if (disposed) return;
      disposed = true;

      observer.disconnect();
      // `stop()` throws when the runner is already stopped or paused.
      if (runner.isRunning) runner.stop();
      session.destroy();
      app.destroy(true, { children: true });

      // Only the mount that currently owns the store may clear it.
      if (globalThis.__devgameHandle === handle) {
        globalThis.__devgameHandle = undefined;
        resetGameStore();
      }
    },
  };

  // A superseded mount keeps its handle — the caller still has to be able to
  // dispose of it — but it neither claims the store nor writes to it.
  if (isCurrent()) {
    globalThis.__devgameHandle = handle;
    // Publishing after claiming ownership means the store always describes the
    // run that is actually on screen.
    session.publish();
  }

  return handle;
}
