"use client";

import { create } from "zustand";

import { emptyMeta, type MetaProgressDto } from "@/game";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { readJson, writeJson } from "@/lib/storage/local";

/**
 * Meta-progression, held locally.
 *
 * Deliberately not `zustand/persist`: the middleware rehydrates from raw JSON,
 * and everything read off this machine has to go through the schema first. The
 * two functions below do the same job in six lines, with validation.
 *
 * `syncState` is what the UI shows. "offline" is not an error — it is the
 * normal state of a player who has not signed in, and the game is complete
 * without an account.
 */

export type SyncState = "offline" | "syncing" | "synced" | "conflict" | "error";

interface MetaStore {
  meta: MetaProgressDto;
  hydrated: boolean;
  syncState: SyncState;
  hydrate(): void;
  setMeta(meta: MetaProgressDto): void;
  setSyncState(state: SyncState): void;
}

export const useMetaStore = create<MetaStore>((set, get) => ({
  meta: emptyMeta(new Date(0).toISOString()),
  hydrated: false,
  syncState: "offline",

  /**
   * Called from an effect rather than at module load: reading storage during
   * render would make the server and the client disagree on the first paint.
   */
  hydrate() {
    if (get().hydrated) return;

    // Imported lazily so the schema does not have to be in scope at module top
    // level, where it would run before the client has mounted.
    import("@/game").then(({ MetaProgressSchema }) => {
      const stored = readJson(STORAGE_KEYS.meta, MetaProgressSchema);
      set({ meta: stored ?? emptyMeta(new Date().toISOString()), hydrated: true });
    });
  },

  setMeta(meta) {
    writeJson(STORAGE_KEYS.meta, meta);
    set({ meta });
  },

  setSyncState(syncState) {
    set({ syncState });
  },
}));
