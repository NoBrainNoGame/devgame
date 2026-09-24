import { describe, expect, test } from "bun:test";

import fc from "fast-check";

import { emptyMeta, type MetaProgressDto } from "@/game";
import { mergeMeta } from "@/lib/profile/merge";

const NOW = "2026-09-21T10:00:00.000Z";

function meta(overrides: Partial<MetaProgressDto> = {}): MetaProgressDto {
  return { ...emptyMeta(NOW), ...overrides };
}

const arbitraryMeta = fc
  .record({
    level: fc.integer({ min: 1, max: 99 }),
    xp: fc.integer({ min: 0, max: 100_000 }),
    commitsBank: fc.integer({ min: 0, max: 50_000 }),
    totalCommits: fc.integer({ min: 0, max: 50_000 }),
    ticketsDelivered: fc.integer({ min: 0, max: 500 }),
    metaVersion: fc.integer({ min: 0, max: 500 }),
    unlockedProfiles: fc.subarray(["junior", "senior", "vibe_coder", "devops"] as const, {
      minLength: 1,
    }),
    unlockedSkills: fc.subarray(["unit_tests", "ci_cd", "linter", "coffee"] as const),
    updatedAt: fc
      .integer({ min: 0, max: 10_000_000 })
      .map((offset) => new Date(Date.parse(NOW) + offset).toISOString()),
  })
  .map((partial) => meta(partial));

describe("mergeMeta", () => {
  test("merging a copy with itself only normalises it", () => {
    fc.assert(
      fc.property(arbitraryMeta, (value) => {
        const merged = mergeMeta(value, value);

        // Every scalar survives untouched; the lists come back sorted, which is
        // what makes two merges in different orders agree.
        expect({ ...merged, unlockedProfiles: [], unlockedSkills: [] }).toEqual({
          ...value,
          unlockedProfiles: [],
          unlockedSkills: [],
        });
        expect(new Set(merged.unlockedSkills)).toEqual(new Set(value.unlockedSkills));
        expect(merged.unlockedSkills).toEqual([...merged.unlockedSkills].sort());
      }),
    );
  });

  test("never loses progress on either side", () => {
    fc.assert(
      fc.property(arbitraryMeta, arbitraryMeta, (a, b) => {
        const merged = mergeMeta(a, b);
        expect(merged.xp).toBeGreaterThanOrEqual(Math.max(a.xp, b.xp));
        expect(merged.level).toBeGreaterThanOrEqual(Math.max(a.level, b.level));
        expect(merged.totalCommits).toBeGreaterThanOrEqual(
          Math.max(a.totalCommits, b.totalCommits),
        );
        expect(merged.ticketsDelivered).toBeGreaterThanOrEqual(
          Math.max(a.ticketsDelivered, b.ticketsDelivered),
        );
      }),
    );
  });

  test("never invents progress either — counters are a maximum, not a sum", () => {
    const a = meta({ totalCommits: 100, xp: 500, ticketsDelivered: 3 });
    const b = meta({ totalCommits: 100, xp: 500, ticketsDelivered: 3 });
    const merged = mergeMeta(a, b);

    expect(merged.totalCommits).toBe(100);
    expect(merged.xp).toBe(500);
    expect(merged.ticketsDelivered).toBe(3);
  });

  test("keeps every unlock from both sides, in a stable order", () => {
    const a = meta({ unlockedSkills: ["linter", "coffee"] });
    const b = meta({ unlockedSkills: ["coffee", "unit_tests"] });

    expect(mergeMeta(a, b).unlockedSkills).toEqual(["coffee", "linter", "unit_tests"]);
    expect(mergeMeta(b, a).unlockedSkills).toEqual(["coffee", "linter", "unit_tests"]);
  });

  test("is order-independent", () => {
    fc.assert(
      fc.property(arbitraryMeta, arbitraryMeta, (a, b) => {
        expect(mergeMeta(a, b)).toEqual(mergeMeta(b, a));
      }),
    );
  });

  test("is idempotent: merging the result back in is a no-op", () => {
    fc.assert(
      fc.property(arbitraryMeta, arbitraryMeta, (a, b) => {
        const once = mergeMeta(a, b);
        expect(mergeMeta(once, a)).toEqual(once);
      }),
    );
  });

  test("settings follow the more recent change, not the higher score", () => {
    const older = meta({
      updatedAt: "2026-09-20T10:00:00.000Z",
      xp: 9999,
      settings: { sound: true, reducedMotion: false, playerName: "" },
    });
    const newer = meta({
      updatedAt: "2026-09-21T10:00:00.000Z",
      xp: 1,
      settings: { sound: false, reducedMotion: true, playerName: "" },
    });

    expect(mergeMeta(older, newer).settings).toEqual({
      sound: false,
      reducedMotion: true,
      playerName: "",
    });
  });
});
