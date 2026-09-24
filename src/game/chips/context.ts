import type { Application, Container } from "pixi.js";

import type { AudioService } from "@/game/audio/AudioService";
import type { RevealSet } from "@/game/bridge/reveal";
import type { GameSession } from "@/game/bridge/session";
import type { Camera } from "@/game/chips/Camera";
import type { I18nText } from "@/game/core/i18n";

/**
 * A slot the scene fills in and the handle reads.
 *
 * The camera is built deep inside the chip tree, and the zoom buttons live in
 * React. This is the one wire between them: a mutable box, rather than a
 * singleton, so two mounted games cannot end up sharing one camera.
 */
export interface SceneControls {
  camera: Camera | null;
  /** Ends the running sequence. The one path a skip takes, from anywhere. */
  skip: (() => void) | null;
}

/**
 * What every chip in the tree can reach. Booyah passes it down automatically,
 * which is how the scene avoids a module-level singleton for the renderer.
 */
export interface SceneContext {
  app: Application;
  session: GameSession;
  /** What the graph may draw right now. Written by the effect queue only. */
  reveal: RevealSet;
  /** Resolves an engine key to a string. The engine never produces one itself. */
  translate: (text: I18nText) => string;
  container: Container;
  /** The camera's transform. Everything in graph space is a child of it. */
  world: Container;
  reducedMotion: boolean;
  /**
   * Whether the pointer drives the camera and skips animations. The landing
   * page draws a run nobody plays: it hovers, and nothing else.
   */
  interactive: boolean;
  /**
   * Whether the commit subjects are drawn beside the graph. The landing page
   * shows the tree alone; a run reads its history.
   */
  subjects: boolean;
  /**
   * Whether a turn's costs and gains rise off the commit as floating
   * numbers. A run reads them; the landing page has nobody to inform and
   * every hold makes the demo longer.
   */
  pops: boolean;
  /** The player's name, for the `HEAD` ref. Empty when nobody said. */
  playerName: string;
  controls: SceneControls;
  /** A look forced by the page for QA, whatever the run has earned. */
  austerityOverride?: number | null;
  /** Where the sounds go. The landing page passes none and gets the silent one. */
  audio: AudioService;
}

export function sceneContext(context: Readonly<Record<string, unknown>>): SceneContext {
  return context as unknown as SceneContext;
}
