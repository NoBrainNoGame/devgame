"use client";

import { useEffect } from "react";

import { hydrateIdleSettings, idleStore, useIdleStore } from "@/components/hud/idleStore";
import { idleSpeedAllowed, idleTarget, type PlayerAction, useGameStore } from "@/game";

/** Seconds the idle clock takes to press the planned move, at normal speed. Rendering, not rules. */
export const IDLE_SECONDS = 10;
const TICK_MS = 50;

/**
 * The hand on the idle clock. Renders nothing.
 *
 * Every snapshot is a new clock — an action of yours, free or not, starts it
 * over — and when it runs out the planned move is pressed: the same one
 * `idleTarget` names for the bar. It waits while the canvas animates, while
 * a dialog that is not the clock's own has the floor, and while the review
 * is still being read. Sped up, the same clock runs ten or a hundred times
 * faster, as far as the run has unlocked.
 */
export function IdleDriver({
  paused,
  onAct,
}: {
  paused: boolean;
  onAct: (action: PlayerAction) => void;
}): null {
  const snapshot = useGameStore((state) => state.snapshot);
  const busy = useGameStore((state) => state.pendingAnimation);
  const settings = useIdleStore((state) => state.settings);

  useEffect(hydrateIdleSettings, []);

  const target = snapshot === null ? undefined : idleTarget(snapshot);
  const running = settings.enabled && !busy && !paused && target !== undefined;

  // A new snapshot is a new clock: the effect re-runs on every dispatch,
  // free or not, and starts from zero.
  useEffect(() => {
    idleStore.setState({ running, elapsedMs: 0 });
    if (!running || snapshot === null || target === undefined) return;

    const speed = idleSpeedAllowed(snapshot.idleSpeedTier, settings.speed) ? settings.speed : 1;
    const dueMs = (IDLE_SECONDS * 1000) / speed;
    let last = performance.now();
    let fired = false;

    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = idleStore.getState().elapsedMs + (now - last);
      last = now;
      idleStore.setState({ elapsedMs: elapsed });
      if (elapsed < dueMs || fired) return;
      fired = true;
      idleStore.setState({ elapsedMs: 0 });
      onAct(target);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [running, snapshot, target, settings.speed, onAct]);

  return null;
}

/** Share of the clock spent, for the bar. Zero when the clock is off. */
export function useIdleProgress(): { pct: number; running: boolean; enabled: boolean } {
  const elapsedMs = useIdleStore((state) => state.elapsedMs);
  const running = useIdleStore((state) => state.running);
  const settings = useIdleStore((state) => state.settings);
  const snapshot = useGameStore((state) => state.snapshot);
  if (!settings.enabled) return { pct: 0, running: false, enabled: false };
  const tier = snapshot?.idleSpeedTier ?? 0;
  const speed = idleSpeedAllowed(tier, settings.speed) ? settings.speed : 1;
  const dueMs = (IDLE_SECONDS * 1000) / speed;
  return { pct: Math.min(100, (elapsedMs / dueMs) * 100), running, enabled: true };
}
