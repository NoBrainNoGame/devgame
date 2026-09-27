"use client";

import { useEffect } from "react";
import { createStore } from "zustand/vanilla";

import { achievementsOfAccount, gameStore } from "@/game";
import type { AchievementId } from "@/game/content";
import { useMetaStore } from "@/lib/storage/useMetaStore";

/**
 * Turning what the run qualifies for into trophies on the profile.
 *
 * The session says, after each action, everything the run now qualifies for;
 * this keeps the ones the profile does not hold yet, dates them, writes them
 * to the profile (locally first, like the rest of it) and queues their popup.
 * The account's own achievements — a level, a total — are checked whenever
 * the profile's totals move.
 */

/** Achievements waiting for their popup, oldest first. */
export const announcements = createStore<{ queue: AchievementId[] }>(() => ({ queue: [] }));

export function dismissAnnouncement(): void {
  announcements.setState((state) => ({ queue: state.queue.slice(1) }));
}

function grant(ids: readonly AchievementId[]): void {
  if (ids.length === 0) return;
  const { meta, setMeta } = useMetaStore.getState();
  const held = new Set<string>(meta.achievements.map((record) => record.id));
  const fresh = [...new Set(ids)].filter((id) => !held.has(id));
  if (fresh.length === 0) return;

  const at = new Date().toISOString();
  setMeta({
    ...meta,
    achievements: [...meta.achievements, ...fresh.map((id) => ({ id, at }))],
    updatedAt: at,
  });
  announcements.setState((state) => ({ queue: [...state.queue, ...fresh] }));
}

/**
 * Mounted once, by the page that owns the profile. Nothing is written before
 * the profile is read from storage: an early write would replace it.
 */
export function useAchievementUnlocks(): void {
  const hydrated = useMetaStore((state) => state.hydrated);

  useEffect(() => {
    if (!hydrated) return;

    const offGame = gameStore.subscribe((state, previous) => {
      if (state.lastAchievements !== previous.lastAchievements) grant(state.lastAchievements);
    });
    const offMeta = useMetaStore.subscribe((state, previous) => {
      if (
        state.meta.level !== previous.meta.level ||
        state.meta.ticketsDelivered !== previous.meta.ticketsDelivered
      ) {
        grant(achievementsOfAccount(state.meta));
      }
    });
    grant(achievementsOfAccount(useMetaStore.getState().meta));

    return () => {
      offGame();
      offMeta();
    };
  }, [hydrated]);
}
