import type { NodeKind } from "@/game/core/types";

/**
 * Colours and measurements for the git graph.
 *
 * Pixi cannot read CSS custom properties, so these are kept in step with the
 * `@theme` block in `src/app/globals.css` by hand — and by a test that compares
 * the two lists. If you change a branch colour, change it in both places.
 */

export const THEME = {
  background: 0x14161b,
  panel: 0x1b1e25,
  line: 0x2f343f,
  text: 0xd7dae0,
  textMuted: 0x8b909c,

  lane: {
    /** `main`. */
    trunk: 0x62c073,
    feature: 0x5aa9e6,
    hotfix: 0xe2645a,
    refactor: 0xe0a458,
  },

  node: {
    locked: 0x3a4050,
    candidate: 0xf5d76e,
    current: 0xffffff,
    doneCraft: 0x62c073,
    doneAi: 0x9b7fd4,
    /** Ring drawn around an AI commit nobody has read yet. */
    unreviewed: 0xe0a458,
  },

  player: 0xffffff,
  bot: 0xd06dc4,
  debt: 0xe0a458,
  energy: 0xf5d76e,
} as const;

/** Column width and row height, in world pixels. */
export const LANE_WIDTH = 52;
export const DEPTH_HEIGHT = 58;
export const NODE_RADIUS = 11;
export const EDGE_WIDTH = 2.5;

export function laneColour(lane: number, kind: NodeKind): number {
  if (kind === "hotfix") return THEME.lane.hotfix;
  if (kind === "refactor" && lane < 0) return THEME.lane.refactor;
  if (lane === 0) return THEME.lane.trunk;
  if (lane < 0) return THEME.lane.hotfix;
  return THEME.lane.feature;
}

/** The glyph drawn inside a node, so kinds read at a glance. */
export function nodeGlyph(kind: NodeKind): string {
  switch (kind) {
    case "sprint_start":
      return "▸";
    case "fork":
      return "⑂";
    case "feature":
      return "·";
    case "feature_merge":
    case "sprint_merge":
      return "⑃";
    case "release":
      return "★";
    case "hotfix":
      return "!";
    case "refactor":
      return "↻";
    case "risky":
      return "⚡";
    case "chore":
      return "~";
    case "commit":
      return "";
  }
}
