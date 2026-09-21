import type { MetaProgressDto } from "@/game";

/**
 * Reconciling two copies of a player's progress.
 *
 * The game is offline-first: you can play signed out, on two devices, on a
 * plane. So there is no authoritative copy, only two that both happened — and
 * the merge has to be something a player would recognise as fair.
 *
 * The rule throughout is **take the better of the two, never the sum**. Both
 * copies may well contain the same run, and adding them would hand out a free
 * doubling to anyone who opened a second tab.
 *
 * Pure, and shared: the client merges before uploading, the server merges again
 * before writing. A single implementation is the only way those two agree.
 */
export function mergeMeta(a: MetaProgressDto, b: MetaProgressDto): MetaProgressDto {
  // XP is cumulative and level is derived from it, so XP alone decides which
  // side's progression is further along.
  const further = a.xp >= b.xp ? a : b;
  const newer = Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b;

  return {
    version: Math.max(a.version, b.version),
    level: Math.max(a.level, b.level),
    xp: Math.max(a.xp, b.xp),

    // Spent points belong with the XP they were earned from.
    statPoints: { ...further.statPoints },
    unspentStatPoints: Math.max(a.unspentStatPoints, b.unspentStatPoints),

    commitsBank: Math.max(a.commitsBank, b.commitsBank),
    totalCommits: Math.max(a.totalCommits, b.totalCommits),
    botsFired: Math.max(a.botsFired, b.botsFired),

    unlockedProfiles: union(a.unlockedProfiles, b.unlockedProfiles),
    unlockedSkills: union(a.unlockedSkills, b.unlockedSkills),

    // Settings are a preference, not an achievement: the last change wins.
    settings: { ...newer.settings },

    // The optimistic lock is the server's, and the server is whichever copy
    // carries the higher value.
    metaVersion: Math.max(a.metaVersion, b.metaVersion),
    updatedAt: newer.updatedAt,
  };
}

/** Sorted so the result is stable, and so two merges in any order agree. */
function union<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])].sort();
}
