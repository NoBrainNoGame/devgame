import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
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
    /** `main`: nothing but sprint merges and releases. */
    trunk: 0x62c073,
    /** `dev`: where every feature is integrated. */
    dev: 0x4fb3a8,
    feature: 0x5aa9e6,
    hotfix: 0xe2645a,
    refactor: 0xe0a458,
  },

  node: {
    /** Fill of a commit you wrote by hand. */
    craft: 0x62c073,
    /** Fill of a commit the machine wrote. */
    ai: 0x9b7fd4,
    /** Ring around an AI commit nobody has read yet. */
    unreviewed: 0xe0a458,
    /** The uncommitted node you are standing on. */
    pending: 0x3a4050,
  },

  player: 0xffffff,
  debt: 0xe0a458,
  energy: 0xf5d76e,
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

/**
 * The conventional-commit prefix a node would carry, so the graph reads like a
 * history rather than a diagram.
 */
export function nodePrefix(kind: NodeKind, mode: "craft" | "ai" | undefined): string {
  switch (kind) {
    case "feature_merge":
    case "sprint_merge":
      return "merge";
    case "hotfix":
    case "fix":
      return "fix";
    case "refactor":
      return "refactor";
    case "release":
      return "release";
    case "squash":
      return "squash";
    case "docs":
      return "docs";
    case "rebase":
      return "rebase";
    case "risky":
      return "perf";
    case "sprint_start":
      return "init";
    case "commit":
      return mode === "ai" ? "chore" : "feat";
  }
}

/** The glyph drawn inside a node, so kinds read at a glance. */
export function nodeGlyph(kind: NodeKind): string {
  switch (kind) {
    case "sprint_start":
      return "◆";
    case "feature_merge":
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
