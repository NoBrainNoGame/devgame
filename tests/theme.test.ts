import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { THEME } from "@/game/render/theme";

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

describe("theme", () => {
  test.each([
    ["bg", THEME.background],
    ["panel", THEME.panel],
    ["line", THEME.line],
    ["branch-main", THEME.lane.trunk],
    ["branch-dev", THEME.lane.dev],
    ["branch-feature", THEME.lane.feature],
    ["branch-hotfix", THEME.lane.hotfix],
    ["branch-bot", THEME.bot],
    ["debt", THEME.debt],
    ["energy", THEME.energy],
    ["ai", THEME.node.ai],
  ])("%s matches the canvas palette", (name, value) => {
    expect(cssColour(name)).toBe(hex(value));
  });
});
