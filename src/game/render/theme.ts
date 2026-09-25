import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { NodeKind } from "@/game/core/types";

/** The prefix lives with the subjects now; re-exported for the graph. */
export { nodePrefix } from "@/game/content/subjects";

/**
 * Colours and measurements for the git graph.
 *
 * Pixi cannot read CSS custom properties, so these are kept in step with the
 * `@theme` block in `src/app/globals.css` by hand — and by a test that compares
 * the two lists. If you change a branch colour, change it in both places.
 */

export const THEME = {
  background: 0x050607,
  panel: 0x0b0e10,
  line: 0x1c2a2a,
  text: 0xdffdf9,
  textMuted: 0x6b9e98,

  lane: {
    /** `main`: nothing but sprint merges and releases. The accent itself. */
    trunk: 0x8afff5,
    /** `dev`: where every feature is integrated. */
    dev: 0x3fc9b8,
    feature: 0x5ab8ff,
    /** The hot colour: an emergency, the accent's shadow. */
    hotfix: 0xff5533,
    refactor: 0xffb347,
    /** An obstacle's column: what a feature turned up, forked off it. */
    obstacle: 0xff5ec4,
  },

  node: {
    /** Fill of a commit you wrote by hand. */
    craft: 0x8afff5,
    /** Fill of a commit the machine wrote. */
    ai: 0xb48cff,
    /** Ring around an AI commit nobody has read yet. */
    unreviewed: 0xffb347,
    /** The uncommitted node you are standing on. */
    pending: 0x1a2a2a,
  },

  player: 0xffffff,

  /*
    The run's figures, each in its own colour wherever it is shown — the
    HUD, the charts, the numbers that rise off a commit, the balls that fly
    to a gauge. The code's health is the debt's colour; the ticket points,
    the skill points and the rest of the HUD are the accent.
  */
  /** The code's health (the debt, turned over): orange, the colour of what breaks. */
  debt: 0xffb347,
  energy: 0xf5e663,
  money: 0x4ade80,
  /** Production's patience. */
  patience: 0xff5ec4,
  /** The sprint clock, turns and months: anything counted in time. */
  time: 0x5ab8ff,
} as const;

/**
 * Column width and row height, in world pixels.
 *
 * The proportions of a desktop git client: narrow columns, short rows, small
 * dots, and the commit subjects in a column of their own to the right of the
 * graph rather than beside each node. That is what makes it read as history
 * rather than as a diagram.
 */
export const LANE_WIDTH = 26;
export const DEPTH_HEIGHT = 34;
export const NODE_RADIUS = 6;
/** The lane lines, and the edges that run along them. */
export const EDGE_WIDTH = 2.5;
/** The radius of the one corner a fork or a merge turns, in world pixels. */
export const CORNER = 10;
/** A trunk with nothing new on it yet is dotted: dash and gap, in world pixels. */
export const LANE_DASH = 3;
export const LANE_GAP = 6;
/** How strongly a branch's own line is drawn, and how faint its dotted continuation. */
export const LANE_ALPHA = { trunk: 0.9, feature: 0.55, continuation: 0.35 } as const;
/** Room between the last column and the subjects, where the refs sit. */
export const REF_GUTTER = 150;
export const LABEL_GAP = 14;

export const ZOOM: { min: number; max: number; step: number; default: number } = {
  min: 0.5,
  max: 3,
  step: 1.15,
  default: 1.4,
};

/**
 * The team's colours, the player's first, spread over the whole spectrum so
 * that eight people on one graph are eight different hues. Not part of the
 * palette the austerity fades: who wrote what has to stay readable at every
 * tier. Kept in step with `--color-dev-<n>` in `globals.css` by the theme
 * test, like the rest.
 */
export const DEV_COLOURS: readonly number[] = [
  0x38bdf8, // sky — the player
  0xf2705d, // coral
  0xf0b429, // amber
  0xb5d33d, // lime
  0x3ecf8e, // mint
  0x6c8cff, // periwinkle
  0xb57bee, // violet
  0xf472b6, // pink
];

export function laneColour(lane: number, kind: NodeKind): number {
  // A `fix:` commit keeps its own colour wherever it was written: an emergency
  // has to read as one even though it lives on the feature you had open.
  if (kind === "hotfix" || kind === "fix") return THEME.lane.hotfix;
  // The maintenance commits share one colour: they are all "stop and tidy up".
  if (kind === "refactor" || kind === "squash" || kind === "docs") return THEME.lane.refactor;

  if (lane === MAIN_LANE) return THEME.lane.trunk;
  if (lane === DEV_LANE) return THEME.lane.dev;
  return THEME.lane.feature;
}

/** The kind a node is *called*. Today every kind is called what it is. */
export function labelledKind(kind: NodeKind): NodeKind {
  return kind;
}

/** The glyph drawn inside a node, so kinds read at a glance. */
export function nodeGlyph(kind: NodeKind): string {
  switch (kind) {
    case "init":
      return "○";
    case "sprint_start":
      return "◆";
    case "feature_merge":
    case "obstacle_merge":
    case "sprint_merge":
      return "⑃";
    case "release":
      return "★";
    case "hotfix":
      return "!";
    case "fix":
      return "\u2713";
    case "refactor":
      return "↻";
    case "risky":
      return "⚡";
    case "squash":
      return "\u229f";
    case "docs":
      return "\u00b6";
    case "rebase":
      return "\u2934";
    case "commit":
      return "";
  }
}
