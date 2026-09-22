"use client";

import { z } from "zod";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { IDLE_SPEEDS, type IdleSpeed } from "@/game";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { readJson, writeJson } from "@/lib/storage/local";

/**
 * The idle clock, shared by everything that shows or drives it.
 *
 * One clock for the whole HUD: the driver ticks it, the bar under whichever
 * button the clock will press reads it, the controls set it. Kept out of
 * React state so a dialog and the panel never hold two copies of "how long
 * since the last decision". The preferences persist in `localStorage`; the
 * elapsed time does not — a reload is a decision too.
 */

const IdleSettingsSchema = z.object({
  enabled: z.boolean(),
  speed: z.union([z.literal(1), z.literal(10), z.literal(100)]),
});

export type IdleSettings = z.infer<typeof IdleSettingsSchema>;

const DEFAULT_IDLE: IdleSettings = { enabled: true, speed: 1 };

export interface IdleStore {
  settings: IdleSettings;
  /** Milliseconds since the last action, counted only while the clock runs. */
  elapsedMs: number;
  /** The driver's view of whether the clock may run right now. */
  running: boolean;
  /** The review dialog is still reading the verdict out loud: the clock waits. */
  readingReview: boolean;
  hydrated: boolean;
}

export const idleStore = createStore<IdleStore>()(() => ({
  settings: DEFAULT_IDLE,
  elapsedMs: 0,
  running: false,
  readingReview: false,
  hydrated: false,
}));

export function useIdleStore<T>(selector: (state: IdleStore) => T): T {
  return useStore(idleStore, selector);
}

/** Reads the stored preferences once, on the client, after the first render. */
export function hydrateIdleSettings(): void {
  if (idleStore.getState().hydrated) return;
  const stored = readJson(STORAGE_KEYS.idle, IdleSettingsSchema);
  idleStore.setState({ settings: stored ?? DEFAULT_IDLE, hydrated: true });
}

export function setIdleSettings(next: Partial<IdleSettings>): void {
  const merged = { ...idleStore.getState().settings, ...next };
  writeJson(STORAGE_KEYS.idle, merged);
  idleStore.setState({ settings: merged, elapsedMs: 0 });
}

export type { IdleSpeed };
export { IDLE_SPEEDS };
