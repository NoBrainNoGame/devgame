import type { Application, Container } from "pixi.js";

import type { GameSession } from "@/game/bridge/session";
import type { I18nText } from "@/game/core/i18n";

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
}

export function sceneContext(context: Readonly<Record<string, unknown>>): SceneContext {
  return context as unknown as SceneContext;
}
