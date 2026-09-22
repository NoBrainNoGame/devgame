import { levelForXp, type MetaProgressDto } from "@/game";
import { PROFILE_IDS, PROFILES, SKILL_IDS, SKILLS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";

/**
 * What a finished run leaves behind.
 *
 * Pure, so the client can show the result the moment a run ends and the server
 * can compute the same thing from a replay without either of them trusting the
 * other. Nothing here reads a clock: the caller passes the timestamp.
 */

export interface RunOutcome {
  /** XP the run earned. */
  xp: number;
  commits: number;
  botsFired: number;
  sprints: number;
}

export interface RunReward {
  meta: MetaProgressDto;
  /** Levels gained, for the "you levelled up" line. */
  levelsGained: number;
  /** Starters and skills that became available because of this run. */
  unlocked: string[];
}

export function applyRunToMeta(meta: MetaProgressDto, outcome: RunOutcome, now: string): RunReward {
  const xp = meta.xp + Math.max(0, outcome.xp);
  const level = levelForXp(xp);
  const levelsGained = Math.max(0, level - meta.level);

  const commitsBank =
    meta.commitsBank + Math.max(0, outcome.commits) * BALANCE.meta.commitBankRatio;

  const unlockedProfiles = PROFILE_IDS.filter(
    (id) => PROFILES[id].unlockCost <= commitsBank || meta.unlockedProfiles.includes(id),
  );
  const unlockedSkills = SKILL_IDS.filter(
    (id) => SKILLS[id].unlockCost <= commitsBank || meta.unlockedSkills.includes(id),
  );

  const before = new Set<string>([...meta.unlockedProfiles, ...meta.unlockedSkills]);
  const unlocked = [...unlockedProfiles, ...unlockedSkills].filter((id) => !before.has(id));

  return {
    meta: {
      ...meta,
      xp,
      level,
      // A level buys a point; spending it is a separate decision on the
      // profile page, so it lands unspent.
      unspentStatPoints: meta.unspentStatPoints + levelsGained * BALANCE.devops.perLevel,
      commitsBank,
      totalCommits: meta.totalCommits + Math.max(0, outcome.commits),
      botsFired: meta.botsFired + Math.max(0, outcome.botsFired),
      unlockedProfiles: [...unlockedProfiles].sort(),
      unlockedSkills: [...unlockedSkills].sort(),
      updatedAt: now,
    },
    levelsGained,
    unlocked: unlocked.sort(),
  };
}

/** Progress towards the next level, as a fraction, for the profile page bar. */
export function levelProgress(
  meta: MetaProgressDto,
  xpForLevel: (level: number) => number,
): number {
  const floor = xpForLevel(meta.level);
  const ceiling = xpForLevel(meta.level + 1);
  if (ceiling <= floor) return 1;
  return Math.max(0, Math.min(1, (meta.xp - floor) / (ceiling - floor)));
}
