"use client";

import { chooseDemo, DEMO_SESSION, demoDone } from "@/game/bridge/demo";
import { type GameHandle, mountGame } from "@/game/bridge/mount";
import { gameStore } from "@/game/bridge/store";
import type { I18nText } from "@/game/core/i18n";

/**
 * The landing page's canvas: the game's scene, mounted on the demo run, played
 * one action at a time at the pace of its own animations. When the demo is
 * over it stays as it is; a replay plays the same run over from nothing. The
 * scene draws the graph alone, without the column of commit subjects and
 * without the numbers a turn pops off its commit: the tree is the picture,
 * hovering a commit still says what it was, and the demo keeps its pace.
 */

export interface LandingHandle {
  replay(): void;
  dispose(): void;
}

/** Breathing room between one action's last effect and the next action. */
const STEP_MS = 420;

export async function mountLanding(
  element: HTMLElement,
  options: {
    translate: (text: I18nText) => string;
    reducedMotion: boolean;
    /** Today's seed, from the server: the browser never derives it. */
    seed: string;
    /** What the `HEAD` badge calls the player: "You", in the page's language. */
    playerName: string;
  },
): Promise<LandingHandle> {
  let generation = 0;
  let handle: GameHandle | null = null;
  let disposed = false;

  const start = async (): Promise<void> => {
    generation += 1;
    const mine = generation;
    const current = (): boolean => !disposed && mine === generation;

    handle?.dispose();
    handle = null;
    const mounted = await mountGame(element, {
      ...DEMO_SESSION,
      seed: options.seed,
      translate: options.translate,
      reducedMotion: options.reducedMotion,
      interactive: false,
      claimsGlobal: false,
      showSubjects: false,
      showPops: false,
      playerName: options.playerName,
    });
    if (!current()) {
      mounted.dispose();
      return;
    }
    handle = mounted;

    for (let played = 0; current(); played += 1) {
      await settled();
      if (!current()) return;
      // The picture keeps fitting the box as the log grows, until the labels
      // would go: from there the camera follows the head, as in a run.
      mounted.camera.frame();
      if (!options.reducedMotion) await sleep(STEP_MS);
      if (!current()) return;

      const snapshot = gameStore.getState().snapshot;
      if (snapshot === null || demoDone(snapshot)) return;
      const action = chooseDemo(snapshot, played);
      if (action === undefined) return;
      if (!mounted.dispatch(action).ok) return;
    }
  };

  void start();

  return {
    replay() {
      void start();
    },
    dispose() {
      disposed = true;
      generation += 1;
      handle?.dispose();
      handle = null;
    },
  };
}

/** Resolves once the scene has finished animating the last action. */
function settled(): Promise<void> {
  if (!gameStore.getState().pendingAnimation) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = gameStore.subscribe((state) => {
      if (state.pendingAnimation) return;
      unsubscribe();
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
