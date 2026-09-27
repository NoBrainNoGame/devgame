import { DEPTH_HEIGHT, LABEL_GAP, LANE_WIDTH } from "@/game/render/theme";

/**
 * Graph space to world pixels.
 *
 * `main` sits on x = 0; feature branches run to the right and hotfixes to the
 * left, which is what makes an emergency read differently from planned work.
 *
 * **Y is negated.** A git graph is read from the bottom up: the first commit is
 * at the foot and history grows upward, which is how every desktop git client
 * draws it and how anyone who has used one expects to read it. Rows increase
 * with time, so a larger row has to sit higher on the screen.
 *
 * `nodeY` takes a **row**, not a depth: `rows.ts` turns one into the other,
 * so the rows of squashed commits leave no hole.
 */
export function nodeX(lane: number): number {
  return lane * LANE_WIDTH;
}

export function nodeY(row: number): number {
  return -row * DEPTH_HEIGHT;
}

/** Where the refs and subjects start: just right of the rightmost column. */
export function labelX(maxLane: number): number {
  return nodeX(maxLane) + LABEL_GAP + LANE_WIDTH / 2;
}
