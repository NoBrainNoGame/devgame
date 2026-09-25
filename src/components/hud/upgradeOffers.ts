import type { RunSnapshot } from "@/game";
import { UPGRADES } from "@/game/content";
import { actionKey } from "@/game/core/rules/preview";

/**
 * What the upgrades dialog could buy right now, and whether any of it is
 * news. The button lights for an offer the player has not looked at since it
 * appeared, not for as long as something is affordable: some rung of the
 * servers almost always is, and a button lit for good is a button nobody
 * sees. A skill point for sale never counts, for the same reason.
 */

/**
 * Every point the tree can take and every upgrade the money covers, by
 * action key. Null while the run is in a phase that sells nothing — an event,
 * a bonus to pick: the offers are not gone, only out of reach for a moment,
 * and their coming back is not news.
 */
export function upgradeOffers(snapshot: Pick<RunSnapshot, "actions" | "phase">): string[] | null {
  if (snapshot.phase.kind !== "choose_action") return null;
  return snapshot.actions
    .filter(
      (action) =>
        action.type === "tree" ||
        // The sites are bought from the team tab, beside the people they seat.
        (action.type === "buy" && UPGRADES[action.id].category !== "org"),
    )
    .map((action) => actionKey(action));
}

/** The offers still seen: one that went away is news again when it comes back. */
export function stillSeen(
  seen: ReadonlySet<string>,
  offers: readonly string[],
): ReadonlySet<string> {
  const kept = new Set(offers.filter((key) => seen.has(key)));
  return kept.size === seen.size ? seen : kept;
}

export function hasNews(offers: readonly string[], seen: ReadonlySet<string>): boolean {
  return offers.some((key) => !seen.has(key));
}
