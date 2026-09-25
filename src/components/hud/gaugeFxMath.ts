/**
 * The arithmetic of the HUD's effects, apart from the DOM so it is tested:
 * how many balls a figure is worth, when each leaves, the path it flies and
 * how it swells on the way, and the segment a gauge loses.
 */

export interface Point {
  x: number;
  y: number;
}

/** Most balls in flight at once, every figure together: ×100 in Auto must not bury the page. */
export const MAX_IN_FLIGHT = 80;
/** Most balls one figure sends: one per unit, up to here. */
export const MAX_BALLS = 16;
/** Sparks at once, off gauges that drop. */
export const MAX_PARTICLES = 40;
/** One ball's flight, drawn between the two for each ball. */
export const FLIGHT_MS = { min: 520, max: 640 } as const;
/** The last ball of a figure leaves at most this long after the first. */
export const STAGGER_SPREAD_MS = 240;
export const MAX_STAGGER_MS = 45;
/** How far into its flight a ball reaches its full size. */
export const GROW_UNTIL = 0.4;
/** Positions a trail remembers, one a frame. */
export const TRAIL_LENGTH = 18;

/**
 * One ball per unit gained — a point of energy, a story point, a point of
 * health or patience, a skill point — up to `MAX_BALLS`. Money counts in
 * thousands and millions, so it sends balls by its order of magnitude.
 */
export function ballCount(gauge: string, delta: number): number {
  const size = Math.abs(delta);
  if (size === 0) return 0;
  if (gauge === "money") return Math.min(MAX_BALLS, 2 + Math.floor(Math.log10(size + 1) * 2));
  return Math.min(MAX_BALLS, Math.max(1, Math.round(size)));
}

/** How long after the first ball the `index`-th leaves. */
export function staggerOf(index: number, count: number): number {
  if (count <= 1) return 0;
  return index * Math.min(MAX_STAGGER_MS, STAGGER_SPREAD_MS / (count - 1));
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/**
 * A ball's size along its flight, 0 to 1: an ease-in-out over the first part
 * of the way, so it swells early and arrives at full size.
 */
export function growth(t: number): number {
  return easeInOutCubic(t / GROW_UNTIL);
}

/** A cubic curve: where a ball starts, the two points that bend it, where it lands. */
export interface FlightPath {
  from: Point;
  c1: Point;
  c2: Point;
  to: Point;
}

/**
 * A path of its own for every ball: bent to one side or the other, by a
 * different amount, and lifted differently, from two draws in [0, 1).
 */
export function pathOf(from: Point, to: Point, bend: number, lift: number): FlightPath {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // The normal to the straight line, and how far along it the curve swings.
  const nx = -dy / length;
  const ny = dx / length;
  const side = bend < 0.5 ? -1 : 1;
  const swing = (0.15 + Math.abs(bend - 0.5) * 1.1) * length * side;
  const rise = (0.1 + lift * 0.35) * length;
  return {
    from,
    c1: { x: from.x + dx * 0.25 + nx * swing, y: from.y + dy * 0.25 + ny * swing - rise },
    c2: { x: from.x + dx * 0.8 + nx * swing * 0.4, y: from.y + dy * 0.8 + ny * swing * 0.4 },
    to,
  };
}

export function pointOn(path: FlightPath, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * path.from.x + b * path.c1.x + c * path.c2.x + d * path.to.x,
    y: a * path.from.y + b * path.c1.y + c * path.c2.y + d * path.to.y,
  };
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

/** `0xrrggbb` with an alpha, for a canvas gradient. */
export function rgba(colour: number, alpha: number): string {
  return `rgba(${(colour >> 16) & 0xff}, ${(colour >> 8) & 0xff}, ${colour & 0xff}, ${alpha})`;
}
