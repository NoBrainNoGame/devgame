"use client";

import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  initialRealtimeState,
  type RealtimeEvent,
  type RealtimeState,
  reduce,
} from "@/realtime/client/reduce";

/**
 * The realtime state as a vanilla Zustand store, shaped like the game's: the
 * writer is the socket, which is not a component, and React only reads.
 * `send` folds an event in with the pure reducer.
 */
export interface RealtimeStore extends RealtimeState {
  dispatch(event: RealtimeEvent): void;
  reset(): void;
}

export function createRealtimeStore(): StoreApi<RealtimeStore> {
  return createStore<RealtimeStore>()((set) => ({
    ...initialRealtimeState(),
    dispatch: (event) => set((state) => reduce(state, event)),
    reset: () => set(() => ({ ...initialRealtimeState() })),
  }));
}

/** The page's own store: one browser, one connection. */
export const realtimeStore = createRealtimeStore();

export function useRealtime<T>(selector: (state: RealtimeStore) => T): T {
  return useStore(realtimeStore, selector);
}
