import "@/lib/server-only";

import { RULES_EPOCH } from "@/game";
import { utcDate } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";

/**
 * The boards.
 *
 * Derived from `Run` rather than kept in a table of their own: a score is
 * already a column on a finished run, and a second copy is a second thing to
 * get out of step. Three composite indexes make the three queries here cheap —
 * see `docs/database.md`.
 *
 * Every query filters on the current rules epoch. A run played before a rules
 * change describes a different game, and ranking the two against each other
 * would make the board a comparison of nothing in particular.
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
  ticketsDelivered: number;
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
  ticketsDelivered: number;
  finishedAt: Date;
}

/**
 * One row per player — their best — rather than one per run, so a single good
 * session cannot fill the page.
 *
 * The `LIMIT` sits on the outer query on purpose. `DISTINCT ON` forces its own
 * `ORDER BY` to start with the partition key, so limiting inside would keep the
 * players with the lexicographically smallest ids rather than the best scores —
 * and would quietly drop the actual leaders the moment the game has more
 * players than the limit.
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
    SELECT * FROM (
      SELECT DISTINCT ON (r."profileId")
        r."id", r."profileId", p."displayName",
        r."score", r."sprintsCompleted", r."ticketsDelivered", r."finishedAt"
      FROM "Run" r
      JOIN "Profile" p ON p."id" = r."profileId"
      WHERE r."status" = 'finished'
        AND r."rulesEpoch" = ${RULES_EPOCH}
        AND r."mode" = ${mode}::"RunMode"
        AND (${day}::date IS NULL OR r."dailyDate" = ${day}::date)
      ORDER BY r."profileId", r."score" DESC, r."finishedAt" ASC
    ) best
    ORDER BY best."score" DESC, best."finishedAt" ASC
    LIMIT ${limit}
  `;
}

export async function getLeaderboard(options: {
  mode: LeaderboardMode;
  period: LeaderboardPeriod;
  viewerProfileId?: string | null;
}): Promise<Leaderboard> {
  const rows = await bestPerPlayer(options.mode, options.period, 500);

  const ranked = rankEntries(
    rows.map((row) => ({
      runId: row.id,
      profileId: row.profileId,
      displayName: row.displayName,
      score: row.score,
      sprints: row.sprintsCompleted,
      ticketsDelivered: row.ticketsDelivered,
      finishedAt: row.finishedAt.toISOString(),
    })),
  );

  // The viewer may sit outside the 500 the board loads, so their own row is
  // looked up separately rather than searched for in a page they are not on.
  const me =
    options.viewerProfileId == null
      ? null
      : (ranked.find((entry) => entry.profileId === options.viewerProfileId) ??
        (await viewerBest(options.mode, options.period, options.viewerProfileId)) ??
        null);

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

/**
 * The viewer's best run and where it actually ranks, for someone who did not
 * make the loaded page. The rank is counted, not guessed.
 */
async function viewerBest(
  mode: LeaderboardMode,
  period: LeaderboardPeriod,
  profileId: string,
): Promise<LeaderboardEntry | null> {
  const day = period === "all" ? null : dayFor(period);

  const rows = await prisma.$queryRaw<(BestRow & { ahead: bigint })[]>`
    WITH best AS (
      SELECT DISTINCT ON (r."profileId")
        r."id", r."profileId", p."displayName",
        r."score", r."sprintsCompleted", r."ticketsDelivered", r."finishedAt"
      FROM "Run" r
      JOIN "Profile" p ON p."id" = r."profileId"
      WHERE r."status" = 'finished'
        AND r."rulesEpoch" = ${RULES_EPOCH}
        AND r."mode" = ${mode}::"RunMode"
        AND (${day}::date IS NULL OR r."dailyDate" = ${day}::date)
      ORDER BY r."profileId", r."score" DESC, r."finishedAt" ASC
    ),
    mine AS (SELECT * FROM best WHERE "profileId" = ${profileId})
    SELECT mine.*, (SELECT count(*) FROM best WHERE best."score" > mine."score") AS ahead
    FROM mine
  `;

  const row = rows[0];
  if (row === undefined) return null;

  return {
    // Ties share a rank, the same way `rankEntries` does it.
    rank: Number(row.ahead) + 1,
    runId: row.id,
    profileId: row.profileId,
    displayName: row.displayName,
    score: row.score,
    sprints: row.sprintsCompleted,
    ticketsDelivered: row.ticketsDelivered,
    finishedAt: row.finishedAt.toISOString(),
  };
}

function dayFor(period: "today" | "yesterday"): string {
  const at = new Date();
  if (period === "yesterday") at.setUTCDate(at.getUTCDate() - 1);
  return utcDate(at);
}
