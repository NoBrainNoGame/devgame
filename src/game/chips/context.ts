import type { Application, Container } from "pixi.js";

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
}

/**
 * What every chip in the tree can reach. Booyah passes it down automatically,
 * which is how the scene avoids a module-level singleton for the renderer.
 */
export interface SceneContext {
  app: Application;
  session: GameSession;
  /** Resolves an engine key to a string. The engine never produces one itself. */
  translate: (text: I18nText) => string;
  container: Container;
  /** The camera's transform. Everything in graph space is a child of it. */
  world: Container;
  reducedMotion: boolean;
  controls: SceneControls;
}

export function sceneContext(context: Readonly<Record<string, unknown>>): SceneContext {
  return context as unknown as SceneContext;
}
