import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { BALANCE } from "@/game/core/balance";
import { austerityOf } from "@/game/core/rules/tier";
import {
  decorationsAt,
  KEY_PALETTES,
  lerpColour,
  lerpPalette,
  paletteAt,
} from "@/game/render/palette";
import { DEV_COLOURS, THEME } from "@/game/render/theme";

/**
 * Pixi cannot read CSS custom properties, so the canvas keeps its own copy of
 * the palette. This is the only thing stopping the two from drifting apart —
 * and a HUD that does not match the graph behind it looks broken long before
 * anyone works out why.
 */
const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function cssColour(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (match?.[1] === undefined) throw new Error(`--color-${name} is not defined in globals.css`);
  return match[1].toLowerCase();
}

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

describe("austerity", () => {
  test("the first key palette is the theme, and the interpolation has its identities", () => {
    expect(KEY_PALETTES[0]).toEqual(structuredClone(THEME));
    const a = KEY_PALETTES[0];
    const b = KEY_PALETTES[6];
    expect(lerpPalette(a, a, 0.5)).toEqual(a);
    expect(lerpPalette(a, b, 0)).toEqual(a);
    expect(lerpPalette(a, b, 1)).toEqual(b);
    expect(paletteAt(0)).toEqual(a);
    expect(paletteAt(6)).toEqual(b);
    expect(paletteAt(9)).toEqual(b);
    // Halfway is neither end: the ambience is between two looks.
    const mid = paletteAt(1);
    expect(mid.background).not.toBe(a.background);
    expect(mid.background).not.toBe(KEY_PALETTES[2].background);
  });

  test("a colour part-way between two stays a colour", () => {
    expect(lerpColour(0x000000, 0xffffff, 0.5)).toBeGreaterThan(0x400000);
    expect(lerpColour(0x000000, 0xffffff, 0.5)).toBeLessThan(0xc0c0c0);
    expect(lerpColour(0x62c073, 0x35d64f, 0)).toBe(0x62c073);
    expect(lerpColour(0x62c073, 0x35d64f, 1)).toBe(0x35d64f);
  });

  test("the austerity climbs with the earnings, a tier at each threshold, and never past the last", () => {
    const { first, growth, last } = BALANCE.economy.tier;
    expect(austerityOf(0)).toBe(0);
    expect(austerityOf(first)).toBe(1);
    expect(austerityOf(first * growth)).toBe(2);
    expect(austerityOf(first * growth ** 40)).toBe(last);
    let previous = 0;
    for (let earned = 0; earned < first * growth ** 3; earned += 137) {
      const value = austerityOf(earned);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    // Between two thresholds the value is between two tiers.
    const between = austerityOf(Math.round(Math.sqrt(first * (first * growth))));
    expect(between).toBeGreaterThan(1.4);
    expect(between).toBeLessThan(1.6);
  });

  test("every decoration fades in over at least a tier, and none is on at the start", () => {
    expect(decorationsAt(0)).toEqual({ grid: 0, scanlines: 0, jitter: 0, bits: 0, rain: 0 });
    // Bits among the balls from 3 to 6, the rain from 3.5 to 6: never a switch.
    expect(decorationsAt(3).bits).toBe(0);
    expect(decorationsAt(4.5).bits).toBeGreaterThan(0);
    expect(decorationsAt(4.5).bits).toBeLessThan(decorationsAt(5.5).bits);
    expect(decorationsAt(6).bits).toBe(1);
    expect(decorationsAt(3.5).rain).toBe(0);
    expect(decorationsAt(4.5).rain).toBeGreaterThan(0);
    expect(decorationsAt(4.5).rain).toBeLessThan(decorationsAt(5.5).rain);
    expect(decorationsAt(6).rain).toBe(1);
    expect(decorationsAt(3.5).grid).toBe(0);
    expect(decorationsAt(4).grid).toBeGreaterThan(0);
    expect(decorationsAt(4).grid).toBeLessThan(decorationsAt(4.5).grid);
    expect(decorationsAt(5.5).scanlines).toBe(0);
    expect(decorationsAt(6).scanlines).toBeGreaterThan(0);
    expect(decorationsAt(5.5).jitter).toBeGreaterThan(0);
    expect(decorationsAt(5.5).jitter).toBeLessThan(1);
  });
});

describe("theme", () => {
  test.each([
    ["bg", THEME.background],
    ["panel", THEME.panel],
    ["line", THEME.line],
    ["branch-main", THEME.lane.trunk],
    ["branch-dev", THEME.lane.dev],
    ["branch-feature", THEME.lane.feature],
    ["branch-hotfix", THEME.lane.hotfix],
    ["branch-obstacle", THEME.lane.obstacle],
    ...DEV_COLOURS.map((value, index): [string, number] => [`dev-${index}`, value]),
    ["debt", THEME.debt],
    ["energy", THEME.energy],
    ["ai", THEME.node.ai],
  ])("%s matches the canvas palette", (name, value) => {
    expect(cssColour(name)).toBe(hex(value));
  });
});
