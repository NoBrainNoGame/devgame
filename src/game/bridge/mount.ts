"use client";

import { Application } from "pixi.js";

import { type AudioService, NullAudioService } from "@/game/audio/AudioService";
import { RevealSet } from "@/game/bridge/reveal";
import { GameSession, type SessionOptions } from "@/game/bridge/session";
import { gameStore, resetGameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import type { SceneControls } from "@/game/chips/context";
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
  /** False for a canvas that is looked at, not played: no zoom, no drag, no skip. */
  interactive?: boolean;
  /** False draws the graph without its column of commit subjects. */
  showSubjects?: boolean;
  /** False plays a turn without the numbers that rise off a commit: faster, and quieter. */
  showPops?: boolean;
  /** What the refs call you beside `HEAD`. Empty: `HEAD` alone. */
  playerName?: string;
  /** True paints no background: the page shows through, and the canvas has no edges. */
  transparent?: boolean;
  /**
   * Whether this mount is the page's game. The landing page mounts a run to
   * look at and must not take the play page's global handle; it still
   * publishes to the store, since the tooltip reads it, on a page where
   * nothing else does.
   */
  claimsGlobal?: boolean;
  /** A look forced for QA (`?austerity=3.7`), never read by the engine. */
  austerityOverride?: number;
  /** The sound engine. Absent, the run is silent. */
  audio?: AudioService;
}

export interface GameHandle {
  dispatch(action: PlayerAction): { ok: true } | { ok: false; reason: string };
  /** The graph's view controls, for the buttons beside the canvas. */
  camera: {
    zoomIn(): void;
    zoomOut(): void;
    /** Back to following the head commit at the default scale. */
    recentre(): void;
    /** Zoom out until the whole revealed history fits. */
    fit(): void;
    /** Fit the picture without letting go of the head: for a canvas that watches a run. */
    frame(): void;
  };
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
  const claimsGlobal = options.claimsGlobal ?? true;

  // A hot reload re-runs this module with the old canvas still on screen.
  if (claimsGlobal) globalThis.__devgameHandle?.dispose();

  mountSerial += 1;
  const serial = mountSerial;
  const isCurrent = (): boolean => serial === mountSerial;

  const app = new Application();
  await app.init({
    resizeTo: element,
    // A transparent canvas clears to premultiplied black: a colour with an
    // alpha of zero would still be added to the page underneath.
    background: options.transparent === true ? 0x000000 : THEME.background,
    backgroundAlpha: options.transparent === true ? 0 : 1,
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

  // A resumed run is rebuilt from what the save says the account was when
  // it started — its unlocks and its skill points — never from the account
  // as it is now. A level gained mid-run would otherwise change the map the
  // log was written on, and the replay would stop at the first move that no
  // longer fits, throwing the rest of the run away.
  const resume = options.resume;
  const session = new GameSession({
    seed: options.seed,
    mode: options.mode,
    profileId: options.profileId,
    meta:
      resume === undefined
        ? options.meta
        : { ...options.meta, unlockedSkills: resume.unlockedSkills },
    clientRunId: options.clientRunId,
    createdAt: options.createdAt,
    ...(resume === undefined
      ? {}
      : { resumeActions: resume.actions, startingSkillPoints: resume.startingSkillPoints }),
    ...(options.showcase === undefined ? {} : { showcase: options.showcase }),
  });

  const controls: SceneControls = { camera: null, skip: null };

  // A resumed run is replayed inside the session without an `applied` event,
  // so everything it wrote is on screen from the first frame and nothing of
  // it is animated.
  const reveal = new RevealSet();
  reveal.showAll(session.getState());

  const runner = new booyah.Runner(() => new GameRoot(), {
    rootContext: {
      app,
      session,
      reveal,
      translate: options.translate,
      reducedMotion: options.reducedMotion ?? false,
      interactive: options.interactive ?? true,
      subjects: options.showSubjects ?? true,
      pops: options.showPops ?? true,
      playerName: options.playerName ?? "",
      controls,
      austerityOverride: options.austerityOverride ?? null,
      audio: options.audio ?? new NullAudioService(),
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
    camera: {
      zoomIn: () => controls.camera?.zoomIn(),
      zoomOut: () => controls.camera?.zoomOut(),
      recentre: () => controls.camera?.recentre(),
      fit: () => controls.camera?.fit(),
      frame: () => controls.camera?.frame(),
    },
    save() {
      return session.save();
    },
    getActions() {
      return session.getActions();
    },
    skipAnimations() {
      if (controls.skip !== null) controls.skip();
      else gameStore.setState({ pendingAnimation: false });
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
      } else if (!claimsGlobal && isCurrent()) {
        resetGameStore();
      }
    },
  };

  // A superseded mount keeps its handle — the caller still has to be able to
  // dispose of it — but it neither claims the store nor writes to it.
  if (isCurrent()) {
    if (claimsGlobal) globalThis.__devgameHandle = handle;
    // Publishing after claiming ownership means the store always describes the
    // run that is actually on screen.
    session.publish();
  }

  return handle;
}
