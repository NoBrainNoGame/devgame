import { BALANCE } from "@/game/core/balance";
import { commitsOf, seatState } from "@/game/core/rules/crew";
import type { RunState, Seat } from "@/game/core/types";

/**
 * A run's score. Commits are the body of it, every story point delivered is
 * worth two of them and surviving a sprint is worth five — the leaderboard
 * should reward shipping, not grinding safe commits forever.
 */
export function computeScore(state: RunState): number {
  const { score } = BALANCE;
  return (
    commitsOf(state) * score.perCommit +
    state.pointsDelivered * score.perTicketPoint +
    Math.max(0, state.sprint - 1) * score.perSprintCompleted
  );
}

/**
 * What one human of a company brought it: their own commits, the points they
 * delivered and the sprints they were there for. The company's score is the
 * run's; this is the part that ranks the players.
 */
export function playerScore(state: RunState, seat: Seat): number {
  const { score } = BALANCE;
  const gone = state.crew?.left[seat];
  if (gone !== undefined) return gone.score;
  const { player, contribution } = seatState(state, seat);
  return (
    player.totalCommits * score.perCommit +
    contribution.pointsDelivered * score.perTicketPoint +
    contribution.sprints * score.perSprintCompleted
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
