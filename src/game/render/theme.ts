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
  bot: 0xd06dc4,
  debt: 0xe0a458,
  energy: 0xf5d76e,
} as const;

/**
 * Column width and row height, in world pixels.
 *
 * Generous compared with a real git client: there are far fewer commits here,
 * and every one of them is a decision somebody made rather than a line in a
 * history nobody reads.
 */
export const LANE_WIDTH = 64;
export const DEPTH_HEIGHT = 70;
export const NODE_RADIUS = 13;
/** Thick and rounded, the way a desktop git client draws a lane. */
export const EDGE_WIDTH = 4;
/** How far a merge or a fork bends out of its column. */
export const BEND = 26;

export const ZOOM: { min: number; max: number; step: number; default: number } = {
  min: 0.4,
  max: 2.4,
  step: 1.15,
  default: 1,
};

export function laneColour(lane: number, kind: NodeKind): number {
  if (kind === "hotfix") return THEME.lane.hotfix;
  if (kind === "refactor" && lane < 0) return THEME.lane.refactor;
  if (lane === 0) return THEME.lane.trunk;
  if (lane < 0) return THEME.lane.hotfix;
  return THEME.lane.feature;
}

/**
 * The kind a node is *called*, which is not always the kind it is.
 *
 * A `fork` is an ordinary commit on `main` that happens to have a branch
 * leaving it. Naming it as a fork — on its button, in its tooltip, beside it on
 * the graph — would tell the player the repository was written before they got
 * there, which is the one thing the graph is not allowed to say. If they open
 * the branch, the lane leaving the node says it better than a word could.
 */
export function labelledKind(kind: NodeKind): NodeKind {
  return kind === "fork" ? "commit" : kind;
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
      return "fix";
    case "refactor":
      return "refactor";
    case "release":
      return "release";
    case "chore":
      return "chore";
    case "risky":
      return "perf";
    case "sprint_start":
      return "init";
    case "commit":
    case "fork":
    case "feature":
      return mode === "ai" ? "chore" : "feat";
  }
}

/** The glyph drawn inside a node, so kinds read at a glance. */
export function nodeGlyph(kind: NodeKind): string {
  switch (kind) {
    case "sprint_start":
      return "◆";
    case "fork":
      return "⑂";
    case "feature":
      return "";
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
