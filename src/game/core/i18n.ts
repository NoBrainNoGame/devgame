/**
 * The rules engine never produces a display string. It produces a key and its
 * parameters, and whoever renders — React or the Pixi scene — looks the key up
 * in `messages/<locale>.json`.
 *
 * This is what lets the same run log read in French and in English, and what
 * lets the server replay a run without pulling a translation layer in.
 */

/**
 * A parameter may itself be a key. "The Rapide made a mistake" needs the bot's
 * *name*, and the engine only knows its archetype — so it passes a reference and
 * lets the renderer resolve it. Marking those explicitly beats guessing from
 * the shape of a string.
 */
export type I18nParam = string | number | { key: string };

export interface I18nText {
  /** Dot path inside the `game` namespace, e.g. `events.merge_conflict.log`. */
  key: string;
  params?: Readonly<Record<string, I18nParam>>;
}

export function text(key: string, params?: Record<string, I18nParam>): I18nText {
  return params === undefined ? { key } : { key, params };
}

/** A parameter that has to be translated before it is substituted. */
export function ref(key: string): { key: string } {
  return { key };
}

/**
 * Renders an `I18nText` with a plain lookup function, resolving any nested
 * references first. Shared by the HUD and the canvas so both read identically.
 */
export function renderText(
  translate: (key: string, params?: Record<string, string | number>) => string,
  value: I18nText,
): string {
  if (value.params === undefined) return translate(value.key);

  const resolved: Record<string, string | number> = {};
  for (const [name, param] of Object.entries(value.params)) {
    resolved[name] = typeof param === "object" ? translate(param.key) : param;
  }

  return translate(value.key, resolved);
}
