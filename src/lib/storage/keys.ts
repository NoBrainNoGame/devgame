/**
 * Every `localStorage` key the app uses, in one place, each carrying its
 * schema version. Bumping a suffix orphans the old value rather than trying to
 * read it — a save the current build cannot parse is worth less than a clean
 * start, and `readJson` deletes it anyway.
 */
export const STORAGE_KEYS = {
  meta: "devgame:meta:v1",
  run: "devgame:run:v3",
  pendingSubmit: "devgame:pending-submit:v3",
  /** The idle clock: on or off, and how fast. A viewer preference, never synced. */
  idle: "devgame:idle:v1",
} as const;

/**
 * `sessionStorage`, which lives as long as the tab. One flag: whether this
 * tab has already counted as a visit, so the page-view counter can tell a
 * visit from a page view without a cookie.
 */
export const SESSION_KEYS = {
  visited: "devgame:visited:v1",
} as const;
