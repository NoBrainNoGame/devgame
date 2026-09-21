/**
 * Every `localStorage` key the app uses, in one place, each carrying its
 * schema version. Bumping a suffix orphans the old value rather than trying to
 * read it — a save the current build cannot parse is worth less than a clean
 * start, and `readJson` deletes it anyway.
 */
export const STORAGE_KEYS = {
  meta: "devgame:meta:v1",
  run: "devgame:run:v1",
  pendingSubmit: "devgame:pending-submit:v1",
} as const;
