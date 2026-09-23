/**
 * `?austerity=3.7` on the play page forces a look, for checking the ambience
 * without earning a fortune. Read by the page, never by the engine: a
 * replay is the same whatever the query string said.
 */
export function austerityOverride(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("austerity");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
