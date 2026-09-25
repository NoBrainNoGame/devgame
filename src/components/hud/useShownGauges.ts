"use client";

import { useMemo } from "react";

import type { RunSnapshot } from "@/game";
import { useGameStore } from "@/game";
import { type GaugeReadout, readout, shownReadout } from "@/game/bridge/gauges";

/**
 * What the HUD shows: the run as it stands, except the gauges the canvas has
 * not yet shown moving, which keep their old value until their figure rises.
 */
export function useShownGauges(snapshot: RunSnapshot): GaugeReadout {
  const held = useGameStore((state) => state.heldGauges);
  return useMemo(() => shownReadout(readout(snapshot), held), [snapshot, held]);
}

/** A ticket's filled points as the HUD shows them: held until its figure rises. */
export function useShownFilled(ticket: { id: string; filled: number }): number {
  const held = useGameStore((state) => state.heldGauges?.points[ticket.id]);
  return held ?? ticket.filled;
}
