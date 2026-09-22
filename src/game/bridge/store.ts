"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { RunSnapshot } from "@/game/bridge/snapshot";
import type { GameEvent, LogLine, NodeId } from "@/game/core/types";

export type ReviewEvent = Extract<GameEvent, { type: "pr_reviewed" }>;

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
  /** Where the hovered commit sits on screen, so the HUD can point at it. */
  hoveredAt: { x: number; y: number } | null;
  /** Current scale, for the zoom readout. */
  zoom: number;
  /** False once the player has dragged or zoomed away from their head commit. */
  cameraFollowing: boolean;
  log: LogLine[];
  /** The most recent batch, for anything that reacts to a single event. */
  lastEvents: GameEvent[];
  /**
   * A pull request just read, until the player has seen the verdict. The
   * review dialog owns it: it opens on it and clears it when dismissed.
   */
  pendingReview: ReviewEvent | null;
  /** Why the last dispatch was refused, if it was. */
  lastError: string | null;
}

export const INITIAL_STORE: GameStore = {
  status: "idle",
  snapshot: null,
  pendingAnimation: false,
  hoveredNodeId: null,
  hoveredAt: null,
  zoom: 1,
  cameraFollowing: true,
  log: [],
  lastEvents: [],
  pendingReview: null,
  lastError: null,
};

export const gameStore = createStore<GameStore>()(() => ({ ...INITIAL_STORE }));

export function useGameStore<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}

export function resetGameStore(): void {
  gameStore.setState({ ...INITIAL_STORE }, true);
}
