import { austerityOverride } from "@/components/hud/austerityOverride";
import type { RunSnapshot } from "@/game";

/**
 * The tier the HUD speaks for: the run's, or the one `?austerity=` or the
 * development panel forces for QA, so the words can be read at every tier
 * without earning it. The engine never sees it. Not a hook: the run's stage
 * subscribes to the override, so everything calling this re-renders when it
 * moves.
 */
export function displayTier(snapshot: Pick<RunSnapshot, "economy">): number {
  const forced = austerityOverride();
  return forced === null ? snapshot.economy.tier : Math.min(6, Math.floor(forced));
}
