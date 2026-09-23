import { cursorStyle, floatingStyle, glyphStyle, labelStyle } from "@/game/render/textStyles";
import { THEME } from "@/game/render/theme";

/**
 * The look of the run, as a continuous thing.
 *
 * Four key palettes, at austerity 0, 2, 4 and 6: colour; dull and undecorated;
 * monochrome; matrix. Everything in between is interpolated in OKLab, so the
 * canvas is almost always between two of them and never switches — the one
 * rule the whole ambience follows. `THEME` stays the truth of austerity 0 and
 * of the CSS; `palette` is what the canvas actually draws with, and
 * `setAusterity` moves it. The HUD writes the same interpolation into CSS
 * variables, so the page and the canvas never disagree.
 */

type Deep<T> = { -readonly [K in keyof T]: T[K] extends number ? number : Deep<T[K]> };
export type Palette = Deep<typeof THEME>;

export const KEY_AUSTERITIES = [0, 2, 4, 6] as const;

export const KEY_PALETTES: Record<(typeof KEY_AUSTERITIES)[number], Palette> = {
  0: structuredClone(THEME) as Palette,
  // Dull: the same hues, a third of the chroma, nothing that shines.
  2: {
    background: 0x15171a,
    panel: 0x1c1e22,
    line: 0x2c2f35,
    text: 0xcfd2d6,
    textMuted: 0x858a92,
    lane: {
      trunk: 0x7fae88,
      dev: 0x6ea59f,
      feature: 0x7c9fc0,
      hotfix: 0xc8776f,
      refactor: 0xc4a36f,
    },
    node: { craft: 0x7fae88, ai: 0x9a8fbd, unreviewed: 0xc4a36f, pending: 0x363a44 },
    player: 0xe8e8e8,
    debt: 0xc4a36f,
    energy: 0xd9c98a,
  },
  // Monochrome: greys with the faintest memory of what the colours were.
  4: {
    background: 0x101112,
    panel: 0x17181a,
    line: 0x2a2b2e,
    text: 0xc4c6c8,
    textMuted: 0x7d8085,
    lane: {
      trunk: 0x9aa0a6,
      dev: 0x8b9196,
      feature: 0xa3a8ad,
      hotfix: 0xb98c88,
      refactor: 0xa9a49a,
    },
    node: { craft: 0x9aa0a6, ai: 0x8e8b99, unreviewed: 0xa9a49a, pending: 0x2c2e33 },
    player: 0xdddddd,
    debt: 0xa9a49a,
    energy: 0xbdb9a6,
  },
  // Matrix: green on near-black, the terminal nobody is reading.
  6: {
    background: 0x050806,
    panel: 0x0a0f0b,
    line: 0x163d1f,
    text: 0x9dffb0,
    textMuted: 0x3f8f52,
    lane: {
      trunk: 0x35d64f,
      dev: 0x2fb948,
      feature: 0x4fe86a,
      hotfix: 0x7bff8f,
      refactor: 0x22a33a,
    },
    node: { craft: 0x35d64f, ai: 0x1f8a33, unreviewed: 0x22a33a, pending: 0x0f2a15 },
    player: 0xc8ffd2,
    debt: 0x22a33a,
    energy: 0xb6ffc4,
  },
};

// --- colour maths -----------------------------------------------------------

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, c * 255)));
}

/** sRGB integer to OKLab, after Björn Ottosson. */
function toOklab(hex: number): [number, number, number] {
  const r = toLinear((hex >> 16) & 0xff);
  const g = toLinear((hex >> 8) & 0xff);
  const b = toLinear(hex & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bb = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return (r << 16) | (g << 8) | bb;
}

/** A colour part-way between two, in OKLab: no muddy middles, no hue jumps. */
export function lerpColour(from: number, to: number, t: number): number {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = toOklab(from);
  const b = toOklab(to);
  return fromOklab([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export function lerpPalette(from: Palette, to: Palette, t: number): Palette {
  return {
    background: lerpColour(from.background, to.background, t),
    panel: lerpColour(from.panel, to.panel, t),
    line: lerpColour(from.line, to.line, t),
    text: lerpColour(from.text, to.text, t),
    textMuted: lerpColour(from.textMuted, to.textMuted, t),
    lane: {
      trunk: lerpColour(from.lane.trunk, to.lane.trunk, t),
      dev: lerpColour(from.lane.dev, to.lane.dev, t),
      feature: lerpColour(from.lane.feature, to.lane.feature, t),
      hotfix: lerpColour(from.lane.hotfix, to.lane.hotfix, t),
      refactor: lerpColour(from.lane.refactor, to.lane.refactor, t),
    },
    node: {
      craft: lerpColour(from.node.craft, to.node.craft, t),
      ai: lerpColour(from.node.ai, to.node.ai, t),
      unreviewed: lerpColour(from.node.unreviewed, to.node.unreviewed, t),
      pending: lerpColour(from.node.pending, to.node.pending, t),
    },
    player: lerpColour(from.player, to.player, t),
    debt: lerpColour(from.debt, to.debt, t),
    energy: lerpColour(from.energy, to.energy, t),
  };
}

/** The palette at any austerity, between the two key palettes around it. */
export function paletteAt(austerity: number): Palette {
  const value = Math.min(KEY_AUSTERITIES[KEY_AUSTERITIES.length - 1] ?? 6, Math.max(0, austerity));
  let lower: (typeof KEY_AUSTERITIES)[number] = 0;
  let upper: (typeof KEY_AUSTERITIES)[number] = 0;
  for (const key of KEY_AUSTERITIES) {
    if (key <= value) lower = key;
    if (key >= value) {
      upper = key;
      break;
    }
  }
  if (lower === upper) return structuredClone(KEY_PALETTES[lower]);
  return lerpPalette(KEY_PALETTES[lower], KEY_PALETTES[upper], (value - lower) / (upper - lower));
}

/**
 * The decorations, each with a ramp at least a tier wide: a grid that fades
 * in from 3.5 to 4.5, scanlines from 5.5 to 6, a jitter of the labels whose
 * amplitude grows from 5 to 6. Zero everywhere before the ramp starts.
 */
export function decorationsAt(austerity: number): {
  grid: number;
  scanlines: number;
  jitter: number;
} {
  const ramp = (from: number, to: number): number =>
    Math.min(1, Math.max(0, (austerity - from) / (to - from)));
  return { grid: ramp(3.5, 4.5) * 0.35, scanlines: ramp(5.5, 6) * 0.25, jitter: ramp(5, 6) };
}

/** What the canvas draws with. Mutated in place by `setAusterity`; read at draw time. */
export const palette: Palette = structuredClone(KEY_PALETTES[0]);

/** Moves the live palette, and the text styles that carry its colours. */
export function setAusterity(austerity: number): void {
  Object.assign(palette, paletteAt(austerity));
  glyphStyle.fill = palette.text;
  labelStyle.fill = palette.textMuted;
  cursorStyle.fill = palette.text;
  floatingStyle.fill = palette.text;
}

/** `#rrggbb`, for the CSS side. */
export function hexOf(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
