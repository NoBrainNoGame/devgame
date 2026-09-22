import { BALANCE } from "@/game/core/balance";
import type { RunState } from "@/game/core/types";

/**
 * A run's score. Commits are the body of it, and surviving a sprint is worth
 * five of them — the leaderboard should reward playing the game, not grinding
 * safe commits forever.
 */
export function computeScore(state: RunState): number {
  const { score } = BALANCE;
  return (
    state.player.totalCommits * score.perCommit +
    Math.max(0, state.sprint - 1) * score.perSprintCompleted
  );
}

/** XP needed to reach `level` from level 1, cumulative. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;

  const { xpForLevel2, levelGrowth } = BALANCE.meta;
  let total = 0;
  let step = xpForLevel2;
  for (let i = 2; i <= level; i++) {
    total += Math.round(step);
    step *= levelGrowth;
  }
  return total;
}

/** The level a given amount of accumulated XP buys. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 999 && xpForLevel(level + 1) <= xp) level += 1;
  return level;
}
