import type { PlayerAction, RunSnapshot } from "@/game";
import { UPGRADES } from "@/game/content";
import { actionKey } from "@/game/core/rules/preview";

/**
 * What the upgrades dialog could buy right now, which of its tabs sells it,
 * and whether any of it is news. The button lights for an offer the player
 * has not looked at since it appeared, not for as long as something is
 * affordable: some rung of the servers almost always is, and a button lit
 * for good is a button nobody sees. An offer is seen when its own tab is on
 * screen, so each tab keeps its own news. A skill point for sale never
 * counts, for the same reason as the servers.
 */

export const UPGRADES_TABS = ["skills", "hiring", "purchases"] as const;

export type UpgradesTab = (typeof UPGRADES_TABS)[number];

export interface Offer {
  key: string;
  tab: UpgradesTab;
}

function tabOf(action: PlayerAction): UpgradesTab | null {
  switch (action.type) {
    case "tree":
      return "skills";
    case "hire":
      return "hiring";
    case "buy":
      // The sites seat the team: they are bought where it is hired.
      return UPGRADES[action.id].category === "org" ? "hiring" : "purchases";
    case "acquire":
      return "purchases";
    default:
      return null;
  }
}

/**
 * Every point the tree can take, every hire, and every purchase the money
 * covers. Null while the run is in a phase that sells nothing — an event, a
 * bonus to pick: the offers are not gone, only out of reach for a moment,
 * and their coming back is not news.
 */
export function upgradeOffers(snapshot: Pick<RunSnapshot, "actions" | "phase">): Offer[] | null {
  if (snapshot.phase.kind !== "choose_action") return null;
  return snapshot.actions.flatMap((action) => {
    const tab = tabOf(action);
    return tab === null ? [] : [{ key: actionKey(action), tab }];
  });
}

/** The offers still seen: one that went away is news again when it comes back. */
export function stillSeen(
  seen: ReadonlySet<string>,
  offers: readonly Offer[],
): ReadonlySet<string> {
  const kept = new Set(offers.filter((offer) => seen.has(offer.key)).map((offer) => offer.key));
  return kept.size === seen.size ? seen : kept;
}

/** Which tabs hold an offer the player has not seen. */
export function newsByTab(
  offers: readonly Offer[],
  seen: ReadonlySet<string>,
): Record<UpgradesTab, boolean> {
  const news = { skills: false, hiring: false, purchases: false };
  for (const offer of offers) if (!seen.has(offer.key)) news[offer.tab] = true;
  return news;
}
