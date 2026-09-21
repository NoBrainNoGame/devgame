"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { RunSnapshot } from "@/game/bridge/snapshot";
import type { GameEvent, LogLine, NodeId } from "@/game/core/types";

/**
 * The seam between the game loop and React.
 *
 * It is a vanilla Zustand store rather than a React one because the writer is
 * not a component: the session writes to it from inside the requestAnimationFrame
 * loop, and React only ever reads.
 */

export interface GameStore {
  status: "idle" | "running" | "game_over";
  snapshot: RunSnapshot | null;
  /** True while the canvas is still playing out the last action. */
  pendingAnimation: boolean;
  hoveredNodeId: NodeId | null;
  log: LogLine[];
  /** The most recent batch, for anything that reacts to a single event. */
  lastEvents: GameEvent[];
  /** Why the last dispatch was refused, if it was. */
  lastError: string | null;
}

export const INITIAL_STORE: GameStore = {
  status: "idle",
  snapshot: null,
  pendingAnimation: false,
  hoveredNodeId: null,
  log: [],
  lastEvents: [],
  lastError: null,
};

export const gameStore = createStore<GameStore>()(() => ({ ...INITIAL_STORE }));

export function useGameStore<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}

export function resetGameStore(): void {
  gameStore.setState({ ...INITIAL_STORE }, true);
}
