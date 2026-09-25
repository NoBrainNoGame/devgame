import type { RunSaveDto } from "@/game";

/**
 * Which of two unfinished runs to keep: the one with more decisions in it.
 *
 * Comparing timestamps would be the obvious rule and the wrong one — two
 * devices disagree about the time, and the clock says nothing about how much
 * of the run actually happened.
 */
export function pickLongerRun(a: RunSaveDto | null, b: RunSaveDto | null): RunSaveDto | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.actions.length >= b.actions.length ? a : b;
}
