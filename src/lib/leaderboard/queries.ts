import "@/lib/server-only";

import { utcDate } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";

/**
 * The boards.
 *
 * Derived from `Run` rather than kept in a table of their own: a score is
 * already a column on a finished run, and a second copy is a second thing to
 * get out of step. Three composite indexes make the three queries here cheap —
 * see `docs/database.md`.
 */

export type LeaderboardMode = "classic" | "daily";
export type LeaderboardPeriod = "today" | "yesterday" | "all";

export interface LeaderboardEntry {
  rank: number;
  runId: string;
  profileId: string;
  displayName: string;
  score: number;
  sprints: number;
  botsFired: number;
  finishedAt: string;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  /** The viewer's own best, even when it falls outside the page. */
  me: LeaderboardEntry | null;
}

const PAGE_SIZE = 50;

interface BestRow {
  id: string;
  profileId: string;
  displayName: string;
  score: number;
  sprintsCompleted: number;
  botsFired: number;
  finishedAt: Date;
}

/**
 * One row per player — their best — rather than one per run, so a single good
 * session cannot fill the page.
 *
 * `DISTINCT ON` is Postgres-specific and has no Prisma equivalent, which is why
 * this is the only raw SQL in the app. Keeping it in one module is the rule
 * from `docs/database.md`.
 */
async function bestPerPlayer(
  mode: LeaderboardMode,
  period: LeaderboardPeriod,
  limit: number,
): Promise<BestRow[]> {
  const day = period === "all" ? null : dayFor(period);

  return prisma.$queryRaw<BestRow[]>`
    SELECT DISTINCT ON (r."profileId")
      r."id", r."profileId", p."displayName",
      r."score", r."sprintsCompleted", r."botsFired", r."finishedAt"
    FROM "Run" r
    JOIN "Profile" p ON p."id" = r."profileId"
    WHERE r."status" = 'finished'
      AND r."mode" = ${mode}::"RunMode"
      AND (${day}::date IS NULL OR r."dailyDate" = ${day}::date)
    ORDER BY r."profileId", r."score" DESC, r."finishedAt" ASC
    LIMIT ${limit}
  `;
}

export async function getLeaderboard(options: {
  mode: LeaderboardMode;
  period: LeaderboardPeriod;
  viewerProfileId?: string | null;
}): Promise<Leaderboard> {
  // `DISTINCT ON` orders by the partition key, so the scores come back
  // unordered. Sorting happens here, over a bounded set.
  const rows = await bestPerPlayer(options.mode, options.period, 500);

  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.finishedAt.getTime() - b.finishedAt.getTime(),
  );

  const ranked = rankEntries(
    sorted.map((row) => ({
      runId: row.id,
      profileId: row.profileId,
      displayName: row.displayName,
      score: row.score,
      sprints: row.sprintsCompleted,
      botsFired: row.botsFired,
      finishedAt: row.finishedAt.toISOString(),
    })),
  );

  const me =
    options.viewerProfileId == null
      ? null
      : (ranked.find((entry) => entry.profileId === options.viewerProfileId) ?? null);

  return { entries: ranked.slice(0, PAGE_SIZE), me };
}

/**
 * Turns a sorted list into ranks. Equal scores share a rank and the next one
 * skips — 1, 2, 2, 4 — because telling two players with identical runs that one
 * of them came fourth would be a lie about the game.
 */
export function rankEntries(rows: readonly Omit<LeaderboardEntry, "rank">[]): LeaderboardEntry[] {
  const out: LeaderboardEntry[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;

  rows.forEach((row, index) => {
    const rank = row.score === lastScore ? lastRank : index + 1;
    lastScore = row.score;
    lastRank = rank;
    out.push({ rank, ...row });
  });

  return out;
}

function dayFor(period: "today" | "yesterday"): string {
  const at = new Date();
  if (period === "yesterday") at.setUTCDate(at.getUTCDate() - 1);
  return utcDate(at);
}
