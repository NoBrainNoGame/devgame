/**
 * The arithmetic of the HUD's effects, apart from the DOM so it is tested:
 * how many balls a figure is worth, the arc they fly, and the segment a
 * gauge loses.
 */

export interface Point {
  x: number;
  y: number;
}

/** Most particles alive at once: ×100 in Auto must not bury the page. */
export const MAX_PARTICLES = 40;
/** A flight, stagger included, fits inside a pop's hold. */
export const FLIGHT_MS = 460;
export const STAGGER_MS = 40;

/** A few balls for a small figure, more for a large one, never a swarm. */
export function ballCount(delta: number): number {
  const size = Math.abs(delta);
  if (size === 0) return 0;
  return Math.min(6, 1 + Math.floor(Math.log10(size + 1) * 2));
}

/** A point along a lifted arc from `from` to `to`, at `t` in [0, 1]. */
export function arcPoint(from: Point, to: Point, t: number, lift = 60): Point {
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift;
  return { x, y };
}

/** The keyframe translations of one flight, relative to its start. */
export function arcKeyframes(from: Point, to: Point, steps = 6, lift = 60): Point[] {
  const frames: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = arcPoint(from, to, i / steps, lift);
    frames.push({ x: p.x - from.x, y: p.y - from.y });
  }
  return frames;
}

/** The piece of a bar a drop takes away, in percent of the bar. */
export function lossSegment(
  previous: number,
  next: number,
): { left: number; width: number } | null {
  const from = Math.max(0, Math.min(100, previous));
  const to = Math.max(0, Math.min(100, next));
  if (to >= from - 0.25) return null;
  return { left: to, width: from - to };
}

/** `0xrrggbb` as CSS. */
export function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
