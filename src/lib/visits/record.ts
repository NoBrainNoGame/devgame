import "@/lib/server-only";

import { prisma } from "@/lib/db";
import { normalisePath, utcDay, type VisitInput } from "@/lib/visits/paths";

/** One more view — and one more visit when the tab is new — on today's row. */
export async function recordVisit(input: VisitInput, now: Date = new Date()): Promise<void> {
  const key = { day: utcDay(now), path: normalisePath(input.path), locale: input.locale };
  const visits = input.first ? 1 : 0;
  await prisma.visitDay.upsert({
    where: { day_path_locale: key },
    create: { ...key, views: 1, visits },
    update: { views: { increment: 1 }, visits: { increment: visits } },
  });
}
