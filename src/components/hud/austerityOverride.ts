import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * A look forced over the run's, for checking the ambience without earning a
 * fortune: `?austerity=3.7` on the play page, or the development panel's
 * slider, which takes over from it. Read by the page and the canvas, never by
 * the engine: a replay is the same whatever was forced.
 */

interface AusterityOverride {
  forced: number | null;
}

function fromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("austerity");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const store = createStore<AusterityOverride>()(() => ({ forced: fromQuery() }));

/** The forced look now, or null for the run's own. */
export function austerityOverride(): number | null {
  return store.getState().forced;
}

/** Null hands the look back to the run. */
export function setAusterityOverride(forced: number | null): void {
  store.setState({ forced });
}

/** The forced look, re-rendering whoever reads it when the slider moves. */
export function useAusterityOverride(): number | null {
  return useStore(store, (state) => state.forced);
}
