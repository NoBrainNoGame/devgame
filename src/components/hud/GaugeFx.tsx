"use client";

import { useEffect } from "react";

import { cancelFlights, flyUnits } from "@/components/hud/flights";
import { ballCount } from "@/components/hud/gaugeFxMath";
import { useReducedMotion } from "@/components/hud/motion";
import { cancelParticles } from "@/components/hud/particles";
import { gameStore } from "@/game";
import { cueKey, releaseGauge, stepGauge, subscribeGaugeCues } from "@/game/bridge/gaugeCues";

/**
 * Where a figure's gauge is on screen, if it is: the first element named for
 * it that has a size and sits in the viewport. The ticket's points live in
 * two places (its tab and the panel); either will do.
 */
function targetOf(key: string): DOMRect | null {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-gauge="${key}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    return rect;
  }
  return null;
}

/**
 * The HUD's effect layer. Mounted once on the run's page, it hears every
 * figure the canvas raises — or a dialog gives — and flies it to its gauge:
 * a gain in balls, one per unit (bits, as the run turns austere), each moving
 * the gauge by its share as it lands. A loss moves its gauge at once, and the
 * gauge shows it itself. Nothing flies with reduced motion, off-screen, or
 * without a target.
 */
export function GaugeFx(): null {
  const reduced = useReducedMotion();

  useEffect(
    () =>
      subscribeGaugeCues(({ cue, batch, from, colour }) => {
        const release = (): void => releaseGauge(batch, cue);
        if (reduced || from === null || cue.delta < 0) {
          release();
          return;
        }
        const target = targetOf(cueKey(cue));
        if (target === null) {
          release();
          return;
        }
        const count = ballCount(cue.gauge, cue.delta);
        flyUnits({
          from,
          to: { x: target.left + target.width / 2, y: target.top + target.height / 2 },
          colour,
          count,
          onLand: (landed) => stepGauge(batch, cue, landed, count),
        });
      }),
    [reduced],
  );

  // The story cut short: nothing is held any more, and nothing flies on.
  useEffect(
    () =>
      gameStore.subscribe((state, previous) => {
        if (previous.heldGauges !== null && state.heldGauges === null) {
          cancelFlights();
          cancelParticles();
        }
      }),
    [],
  );

  useEffect(
    () => () => {
      cancelFlights();
      cancelParticles();
    },
    [],
  );

  return null;
}
