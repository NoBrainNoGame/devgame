/**
 * The rules engine never produces a display string. It produces a key and its
 * parameters, and whoever renders — React or the Pixi scene — looks the key up
 * in `messages/<locale>.json`.
 *
 * This is what lets the same run log read in French and in English, and what
 * lets the server replay a run without pulling a translation layer in.
 */
export interface I18nText {
  /** Dot path inside the `game` namespace, e.g. `events.merge_conflict.log`. */
  key: string;
  params?: Readonly<Record<string, string | number>>;
}

export function text(key: string, params?: Record<string, string | number>): I18nText {
  return params === undefined ? { key } : { key, params };
}
