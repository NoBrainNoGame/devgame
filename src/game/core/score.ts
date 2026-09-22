import { BALANCE } from "@/game/core/balance";
import type { RunState } from "@/game/core/types";

/**
 * A run's score. Commits are the body of it, every story point delivered is
 * worth two of them and surviving a sprint is worth five — the leaderboard
 * should reward shipping, not grinding safe commits forever.
 */
export function computeScore(state: RunState): number {
  const { score } = BALANCE;
  return (
    state.player.totalCommits * score.perCommit +
    state.pointsDelivered * score.perTicketPoint +
    Math.max(0, state.sprint - 1) * score.perSprintCompleted
  );
}

/**
 * Skill points an account of this level starts every run with. One place,
 * because the session credits it and the server checks the claim against it.
 */
export function accountSkillPoints(level: number): number {
  return Math.max(0, level - 1) * BALANCE.tree.perAccountLevel;
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
