"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { STORAGE_KEYS } from "@/lib/storage/keys";
import { readJson, writeJson } from "@/lib/storage/local";

/**
 * The idle clock's preferences: whether it runs at all, and how fast.
 *
 * A per-viewer convenience, not part of the run: the engine never sees the
 * clock, the action log records what it pressed like any other move, and a
 * player who wants to manage every turn themselves — or step away for an hour
 * without the run playing on — turns it off. Kept in `localStorage` so the
 * choice survives a reload, and defaulted to on at normal speed when there is
 * nothing stored.
 */

export const IDLE_SPEEDS = [1, 2, 5, 10] as const;
export type IdleSpeed = (typeof IDLE_SPEEDS)[number];

const IdleSettingsSchema = z.object({
  enabled: z.boolean(),
  speed: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
});

export type IdleSettings = z.infer<typeof IdleSettingsSchema>;

const DEFAULT_IDLE: IdleSettings = { enabled: true, speed: 1 };

export function useIdleSettings(): [IdleSettings, (next: Partial<IdleSettings>) => void] {
  const [settings, setSettings] = useState<IdleSettings>(DEFAULT_IDLE);

  // Read after mount: the server render has no storage, and a mismatch on
  // hydration is worse than one frame at the default.
  useEffect(() => {
    const stored = readJson(STORAGE_KEYS.idle, IdleSettingsSchema);
    if (stored !== null) setSettings(stored);
  }, []);

  const update = useCallback((next: Partial<IdleSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      writeJson(STORAGE_KEYS.idle, merged);
      return merged;
    });
  }, []);

  return [settings, update];
}
