import { DEPTH_HEIGHT, LANE_WIDTH } from "@/game/render/theme";

/**
 * Graph space to world pixels. `main` sits on x = 0; feature branches run to
 * the right and hotfixes to the left, which is what makes an emergency read
 * differently from planned work.
 */
export function nodeX(lane: number): number {
  return lane * LANE_WIDTH;
}

export function nodeY(depth: number): number {
  return depth * DEPTH_HEIGHT;
}
