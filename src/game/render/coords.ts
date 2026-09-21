import { DEPTH_HEIGHT, LANE_WIDTH } from "@/game/render/theme";

/**
 * Graph space to world pixels.
 *
 * `main` sits on x = 0; feature branches run to the right and hotfixes to the
 * left, which is what makes an emergency read differently from planned work.
 *
 * **Y is negated.** A git graph is read from the bottom up: the first commit is
 * at the foot and history grows upward, which is how every desktop git client
 * draws it and how anyone who has used one expects to read it. Depth increases
 * with time, so a larger depth has to sit higher on the screen.
 */
export function nodeX(lane: number): number {
  return lane * LANE_WIDTH;
}

export function nodeY(depth: number): number {
  return -depth * DEPTH_HEIGHT;
}
