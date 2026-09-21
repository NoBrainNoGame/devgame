import { describe, expect, test } from "bun:test";

import { emptyMeta, levelForXp, xpForLevel } from "@/game";
import { PROFILES } from "@/game/content";
import { applyRunToMeta, levelProgress } from "@/lib/profile/progression";

const NOW = "2026-09-21T10:00:00.000Z";
const LATER = "2026-09-22T10:00:00.000Z";

const nothing = { xp: 0, commits: 0, botsFired: 0, sprints: 0 };

describe("applyRunToMeta", () => {
  test("a run that earned nothing changes nothing but the timestamp", () => {
    const before = emptyMeta(NOW);
    const { meta, levelsGained, unlocked } = applyRunToMeta(before, nothing, LATER);

    expect({ ...meta, updatedAt: NOW }).toEqual(before);
    expect(levelsGained).toBe(0);
    expect(unlocked).toEqual([]);
  });

  test("commits accumulate into both the lifetime total and the bank", () => {
    const { meta } = applyRunToMeta(emptyMeta(NOW), { ...nothing, commits: 42 }, LATER);
    expect(meta.totalCommits).toBe(42);
    expect(meta.commitsBank).toBe(42);
  });

  test("XP raises the level and hands out a point to spend", () => {
    const xp = xpForLevel(3);
    const { meta, levelsGained } = applyRunToMeta(emptyMeta(NOW), { ...nothing, xp }, LATER);

    expect(meta.level).toBe(levelForXp(xp));
    expect(meta.level).toBeGreaterThan(1);
    expect(levelsGained).toBe(meta.level - 1);
    expect(meta.unspentStatPoints).toBe(levelsGained);
  });

  test("banked commits unlock the starters that cost that much", () => {
    const { meta, unlocked } = applyRunToMeta(
      emptyMeta(NOW),
      { ...nothing, commits: PROFILES.senior.unlockCost },
      LATER,
    );

    expect(meta.unlockedProfiles).toContain("senior");
    expect(unlocked).toContain("senior");
    expect(meta.unlockedProfiles).not.toContain("devops");
  });

  test("an unlock already earned is not reported again", () => {
    const once = applyRunToMeta(
      emptyMeta(NOW),
      { ...nothing, commits: PROFILES.senior.unlockCost },
      LATER,
    );
    const twice = applyRunToMeta(once.meta, { ...nothing, commits: 1 }, LATER);

    expect(twice.unlocked).toEqual([]);
    expect(twice.meta.unlockedProfiles).toContain("senior");
  });

  test("an unlock is never taken away, even if the bank is somehow lower", () => {
    const granted = { ...emptyMeta(NOW), unlockedProfiles: ["junior", "devops"] as const };
    const { meta } = applyRunToMeta(
      { ...granted, unlockedProfiles: [...granted.unlockedProfiles] },
      nothing,
      LATER,
    );
    expect(meta.unlockedProfiles).toContain("devops");
  });

  test("negative figures from a broken caller cannot drain an account", () => {
    const rich = { ...emptyMeta(NOW), xp: 1000, totalCommits: 500, commitsBank: 500 };
    const { meta } = applyRunToMeta(
      rich,
      { xp: -50, commits: -100, botsFired: -3, sprints: 0 },
      LATER,
    );

    expect(meta.xp).toBe(1000);
    expect(meta.totalCommits).toBe(500);
    expect(meta.botsFired).toBe(0);
  });
});

describe("levelProgress", () => {
  test("is zero at the start of a level and approaches one at the end", () => {
    const atFloor = { ...emptyMeta(NOW), level: 2, xp: xpForLevel(2) };
    const nearCeiling = { ...emptyMeta(NOW), level: 2, xp: xpForLevel(3) - 1 };

    expect(levelProgress(atFloor, xpForLevel)).toBe(0);
    expect(levelProgress(nearCeiling, xpForLevel)).toBeGreaterThan(0.9);
    expect(levelProgress(nearCeiling, xpForLevel)).toBeLessThan(1);
  });

  test("never leaves the zero-to-one range", () => {
    const impossible = { ...emptyMeta(NOW), level: 5, xp: 0 };
    expect(levelProgress(impossible, xpForLevel)).toBe(0);
  });
});
