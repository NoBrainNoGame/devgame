import { BALANCE } from "@/game/core/balance";
import type { DebtView } from "@/game/core/rules/modifiers";

/**
 * The HUD's gauges are full when things go well, and every drop is bad news.
 * Two of the engine's quantities count the other way — technical debt, and
 * production's impatience, full at the sack — so the HUD shows their
 * complements: the code's health and production's patience. The engine and
 * the save keep counting as they always did; only the picture turns over.
 */

export interface HealthView {
  /** The exact health, once a linter shows the debt. */
  exact: number | null;
  /** The band the debt's blur allows, lowest first. */
  range: [number, number];
}

export const HEALTH_MAX = BALANCE.debt.max;

/** The debt's band, turned over: never exact unless the debt is. */
export function healthOf(debt: DebtView): HealthView {
  return {
    exact: debt.exact === null ? null : HEALTH_MAX - debt.exact,
    range: [HEALTH_MAX - debt.range[1], HEALTH_MAX - debt.range[0]],
  };
}

/** How the HUD writes it: the number, or the band. */
export function healthText(health: HealthView): string {
  return health.exact === null ? `${health.range[0]}–${health.range[1]}` : String(health.exact);
}

/** What production has left before the sack. */
export function patienceOf(quality: number, qualityMax: number): number {
  return Math.max(0, qualityMax - quality);
}

/** The health under which the review refuses a pull request. */
export function healthFloor(): number {
  return HEALTH_MAX - BALANCE.acceptance.maxDebt;
}
