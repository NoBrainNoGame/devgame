"use client";

import { useEffect, useMemo, useState } from "react";

import {
  newsByTab,
  stillSeen,
  type UpgradesTab,
  upgradeOffers,
} from "@/components/hud/upgradeOffers";
import type { RunSnapshot } from "@/game";

export interface UpgradesNews {
  /** Something anywhere in the dialog the player has not seen: the button shines. */
  any: boolean;
  tabs: Record<UpgradesTab, boolean>;
}

const NO_NEWS: Record<UpgradesTab, boolean> = { skills: false, hiring: false, purchases: false };

/**
 * What is new in the upgrades dialog. `viewing` is the tab on screen, or
 * null with the dialog shut: its offers are seen as they appear. A reload
 * forgets, and shows the news once more.
 */
export function useUpgradesNews(
  snapshot: RunSnapshot | null,
  viewing: UpgradesTab | null,
): UpgradesNews {
  const offers = useMemo(() => (snapshot === null ? null : upgradeOffers(snapshot)), [snapshot]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (offers === null) return;
    setSeen((previous) => {
      const kept = stillSeen(previous, offers);
      if (viewing === null) return kept;
      const shown = offers.filter((offer) => offer.tab === viewing && !kept.has(offer.key));
      return shown.length === 0 ? kept : new Set([...kept, ...shown.map((offer) => offer.key)]);
    });
  }, [viewing, offers]);

  const tabs = offers === null ? NO_NEWS : newsByTab(offers, seen);
  return { any: tabs.skills || tabs.hiring || tabs.purchases, tabs };
}
