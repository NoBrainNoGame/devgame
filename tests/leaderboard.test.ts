import { describe, expect, test } from "bun:test";

import { type LeaderboardEntry, rankEntries } from "@/lib/leaderboard/queries";

type Row = Omit<LeaderboardEntry, "rank">;

function row(score: number, name = `p${score}`): Row {
  return {
    runId: `run-${name}`,
    profileId: `profile-${name}`,
    displayName: name,
    score,
    sprints: 1,
    botsFired: 0,
    finishedAt: "2026-09-21T10:00:00.000Z",
  };
}

describe("rankEntries", () => {
  test("ranks a sorted list from one", () => {
    expect(rankEntries([row(30), row(20), row(10)]).map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  test("equal scores share a rank and the next one skips", () => {
    const ranks = rankEntries([row(30, "a"), row(20, "b"), row(20, "c"), row(10, "d")]).map(
      (e) => e.rank,
    );
    expect(ranks).toEqual([1, 2, 2, 4]);
  });

  test("a whole board of ties is all first", () => {
    expect(rankEntries([row(5, "a"), row(5, "b"), row(5, "c")]).map((e) => e.rank)).toEqual([
      1, 1, 1,
    ]);
  });

  test("keeps every field it was given", () => {
    const [first] = rankEntries([row(42, "camille")]);
    expect(first).toEqual({ rank: 1, ...row(42, "camille") });
  });

  test("an empty board ranks to nothing", () => {
    expect(rankEntries([])).toEqual([]);
  });
});
