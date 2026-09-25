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

/** Everything the HUD reads that a pop can move, keyed as the cues name it. */
export interface GaugeReadout {
  energy: number;
  health: HealthView;
  patience: number;
  money: number;
  skills: number;
  /** Filled points of every open ticket. */
  points: Record<string, number>;
}

export interface ReadoutSource {
  player: { energy: number };
  debt: DebtView;
  quality: number;
  qualityMax: number;
  economy: { money: number };
  skillPoints: number;
  tickets: readonly { id: string; status: string; filled: number }[];
}

export function readout(snapshot: ReadoutSource): GaugeReadout {
  const points: Record<string, number> = {};
  for (const ticket of snapshot.tickets) {
    if (ticket.status === "open") points[ticket.id] = ticket.filled;
  }
  return {
    energy: snapshot.player.energy,
    health: healthOf(snapshot.debt),
    patience: patienceOf(snapshot.quality, snapshot.qualityMax),
    money: snapshot.economy.money,
    skills: snapshot.skillPoints,
    points,
  };
}

/**
 * The values the HUD keeps showing while the canvas tells how they changed.
 * A gauge absent from `values` shows the snapshot. `applied` is the last cue
 * serial each gauge took, so a late cue never moves it back.
 */
export interface HeldGauges {
  batch: number;
  values: Partial<Omit<GaugeReadout, "points">>;
  points: Record<string, number>;
  applied: Record<string, number>;
}

/** Buying, hiring, placing a tree node: the shop shows its own price, at once. */
export function isShopAction(action: { type: string }): boolean {
  return (
    action.type === "buy" ||
    action.type === "buy_point" ||
    action.type === "hire" ||
    action.type === "acquire" ||
    action.type === "tree"
  );
}

const sameHealth = (a: HealthView, b: HealthView): boolean =>
  a.exact === b.exact && a.range[0] === b.range[0] && a.range[1] === b.range[1];

/**
 * What to hold at a publication: every readout that changed, at its old
 * value — except money and skill points on a purchase. Nothing when nothing
 * changed.
 */
export function holdFor(
  prev: GaugeReadout,
  next: GaugeReadout,
  action: { type: string },
  batch: number,
): HeldGauges | null {
  const values: HeldGauges["values"] = {};
  if (prev.energy !== next.energy) values.energy = prev.energy;
  if (!sameHealth(prev.health, next.health)) values.health = prev.health;
  if (prev.patience !== next.patience) values.patience = prev.patience;
  if (!isShopAction(action)) {
    if (prev.money !== next.money) values.money = prev.money;
    if (prev.skills !== next.skills) values.skills = prev.skills;
  }
  const points: Record<string, number> = {};
  for (const [id, filled] of Object.entries(next.points)) {
    const before = prev.points[id] ?? 0;
    if (before !== filled) points[id] = before;
  }
  if (Object.keys(values).length === 0 && Object.keys(points).length === 0) return null;
  return { batch, values, points, applied: {} };
}

/** The readout the HUD shows: the snapshot's, with whatever is still held on top. */
export function shownReadout(live: GaugeReadout, held: HeldGauges | null): GaugeReadout {
  if (held === null) return live;
  return { ...live, ...held.values, points: { ...live.points, ...held.points } };
}
