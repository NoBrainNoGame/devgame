"use client";

import { useEffect, useMemo, useState } from "react";

import { hasNews, stillSeen, upgradeOffers } from "@/components/hud/upgradeOffers";
import type { RunSnapshot } from "@/game";

/**
 * Whether the upgrades button should shine: something is on offer that the
 * player has not seen with the dialog open. Opening it marks everything on
 * offer as seen; a reload forgets, and shows the news once more.
 */
export function useUpgradesNews(snapshot: RunSnapshot | null, open: boolean): boolean {
  const offers = useMemo(() => (snapshot === null ? null : upgradeOffers(snapshot)), [snapshot]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (offers === null) return;
    setSeen((previous) => (open ? new Set([...previous, ...offers]) : stillSeen(previous, offers)));
  }, [open, offers]);

  return offers !== null && hasNews(offers, seen);
}
