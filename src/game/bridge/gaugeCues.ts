import { type HeldGauges, readout } from "@/game/bridge/gauges";
import { gameStore } from "@/game/bridge/store";
import type { GaugeCue, Point } from "@/game/render/storyboard";

/**
 * The wire between a pop on the canvas and the gauge it moves.
 *
 * When a pop rises, its cue goes out with where it rose on the page; the
 * HUD's effect layer flies it to the gauge and releases the gauge when it
 * lands. With nobody listening — no HUD, a hot reload — the cue releases the
 * gauge itself, so a held value never outlives its story.
 */

export interface GaugePulse {
  cue: GaugeCue;
  batch: number;
  /** Where the figure rose, in page (client) coordinates; null when unknown. */
  from: Point | null;
  /** The pop's colour, `0xrrggbb`. */
  colour: number;
}

type Listener = (pulse: GaugePulse) => void;

const listeners = new Set<Listener>();

export function subscribeGaugeCues(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGaugeCue(pulse: GaugePulse): void {
  if (listeners.size === 0) {
    releaseGauge(pulse.batch, pulse.cue);
    return;
  }
  for (const listener of [...listeners]) listener(pulse);
}

export function cueKey(cue: Pick<GaugeCue, "gauge" | "ticketId">): string {
  return cue.gauge === "points" ? `points:${cue.ticketId ?? ""}` : cue.gauge;
}

function isEmpty(held: HeldGauges): boolean {
  return Object.keys(held.values).length === 0 && Object.keys(held.points).length === 0;
}

/** Drops whatever has caught up with the snapshot: it is no longer held back. */
function settle(held: HeldGauges): HeldGauges | null {
  const snapshot = gameStore.getState().snapshot;
  if (snapshot === null) return null;
  const live = readout(snapshot);
  const values = { ...held.values };
  if (values.energy === live.energy) delete values.energy;
  if (values.patience === live.patience) delete values.patience;
  if (values.money === live.money) delete values.money;
  if (values.skills === live.skills) delete values.skills;
  const points = { ...held.points };
  for (const [id, filled] of Object.entries(points)) {
    if (live.points[id] === filled || live.points[id] === undefined) delete points[id];
  }
  const next = { ...held, values, points };
  return isEmpty(next) ? null : next;
}

/** Moves one gauge to its cue's value, unless the cue is late or from another batch. */
export function releaseGauge(batch: number, cue: GaugeCue): void {
  const held = gameStore.getState().heldGauges;
  if (held === null || held.batch !== batch) return;
  const key = cueKey(cue);
  if ((held.applied[key] ?? 0) >= cue.serial) return;

  const values = { ...held.values };
  const points = { ...held.points };
  if (cue.gauge === "points") {
    if (cue.ticketId !== undefined && cue.value !== null) points[cue.ticketId] = cue.value;
    else if (cue.ticketId !== undefined) delete points[cue.ticketId];
  } else if (cue.gauge === "health" || cue.value === null) {
    // The blurred health has no exact value mid-batch: it goes to the final one.
    delete values[cue.gauge as keyof HeldGauges["values"]];
  } else {
    values[cue.gauge] = cue.value;
  }
  gameStore.setState({
    heldGauges: settle({
      ...held,
      values,
      points,
      applied: { ...held.applied, [key]: cue.serial },
    }),
  });
}

/** Releases every held gauge no cue of this batch will ever move. */
export function releaseUncued(batch: number, cued: ReadonlySet<string>): void {
  const held = gameStore.getState().heldGauges;
  if (held === null || held.batch !== batch) return;
  const values = { ...held.values };
  for (const gauge of Object.keys(values) as (keyof HeldGauges["values"])[]) {
    if (!cued.has(gauge)) delete values[gauge];
  }
  const points = { ...held.points };
  for (const id of Object.keys(points)) {
    if (!cued.has(`points:${id}`)) delete points[id];
  }
  const next = { ...held, values, points };
  gameStore.setState({ heldGauges: isEmpty(next) ? null : next });
}

/** The story is over, or cut short: every gauge shows the run as it stands. */
export function clearHeld(): void {
  if (gameStore.getState().heldGauges !== null) gameStore.setState({ heldGauges: null });
}
