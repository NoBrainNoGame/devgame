import "@/lib/server-only";

import { deriveDailySeed, utcDate } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Offline there is no leaderboard for a daily to be comparable on, so the seed
 * only has to be the same for everyone running this build on the same day. A
 * fixed key does that; a secret would protect a board that does not exist.
 */
const OFFLINE_DAILY_KEY = "devgame-offline-daily";

export async function getDailySeed(at: Date = new Date()): Promise<{ date: string; seed: string }> {
  const date = utcDate(at);

  if (!env.ONLINE || env.DAILY_SEED_SECRET === undefined) {
    return { date, seed: deriveDailySeed(date, OFFLINE_DAILY_KEY) };
  }

  const day = new Date(`${date}T00:00:00.000Z`);

  const existing = await prisma.dailySeed.findUnique({ where: { date: day } });
  if (existing !== null) return { date, seed: existing.seed };

  const seed = deriveDailySeed(date, env.DAILY_SEED_SECRET);

  // Two players can land here in the same millisecond; whoever loses the race
  // reads the winner's row rather than failing.
  const created = await prisma.dailySeed.upsert({
    where: { date: day },
    create: { date: day, seed },
    update: {},
  });

  return { date, seed: created.seed };
}
