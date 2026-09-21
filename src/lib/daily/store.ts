import "@/lib/server-only";

import { deriveDailySeed, utcDate } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Today's seed, memoised.
 *
 * The derivation is deterministic, so storing it looks redundant — until
 * `DAILY_SEED_SECRET` is rotated, at which point every past board would silently
 * describe a different game. The row is what keeps yesterday's scores meaning
 * something.
 */
export async function getDailySeed(at: Date = new Date()): Promise<{ date: string; seed: string }> {
  const date = utcDate(at);
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
