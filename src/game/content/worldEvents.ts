/**
 * What happens to every company of a world at once. Each one moves the
 * company-wide gauges the narrative events already move (money, patience,
 * debt, the share customers remember) and, for the energy, every human.
 *
 * `moneyPct` is a share of the money in the bank, so the same event stings a
 * small company and a large one in proportion.
 */

export const WORLD_EVENT_IDS = [
  "hackathon",
  "cloud_outage",
  "talent_war",
  "viral_trend",
  "audit",
  "heat_wave",
  "funding_wave",
  "regulation",
] as const;

export type WorldEventId = (typeof WORLD_EVENT_IDS)[number];

export interface WorldEventEffect {
  /** Energy to every human of the company. */
  energy?: number;
  /** Percent of the money in the bank. */
  moneyPct?: number;
  /** Percentage points of patience. */
  quality?: number;
  debt?: number;
  /** Percentage points of share. */
  share?: number;
}

export const WORLD_EVENTS: Record<WorldEventId, WorldEventEffect> = {
  hackathon: { energy: 2, debt: 3 },
  cloud_outage: { quality: 6, moneyPct: -3 },
  talent_war: { moneyPct: -5 },
  viral_trend: { share: 3, energy: -1 },
  audit: { debt: -4, quality: 3 },
  heat_wave: { energy: -2 },
  funding_wave: { moneyPct: 6 },
  regulation: { quality: 4, share: -2 },
};

export function isWorldEventId(value: string): value is WorldEventId {
  return Object.hasOwn(WORLD_EVENTS, value);
}
