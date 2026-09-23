"use server";

import "@/lib/server-only";

import { revalidatePath } from "next/cache";

import { type ActionResult, fail, guard, ok } from "@/lib/actions/result";
import { prisma } from "@/lib/db";
import { hit, LIMITS } from "@/lib/rate-limit";
import { filledTooFast, REPORT_LIMITS, ReportInputSchema } from "@/lib/report/validate";
import { getCurrentUserId } from "@/lib/session";

/**
 * Filing a bug report. Signed in, not suspended, at a human pace, a few an
 * hour and a handful a day; what passes is stored as it was typed, with the
 * page and the seed the player named. The administrator reads it in the
 * local panel, never on the site.
 */
export async function submitBugReport(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    const parsed = ReportInputSchema.safeParse(input);
    if (!parsed.success) return fail("invalid", "That report is malformed", parsed.error.issues);
    // A bot fails quietly, with the same answer a typo gets.
    if (filledTooFast(parsed.data, Date.now())) return fail("invalid", "Filled too fast");

    if (!hit(`report:${userId}`, LIMITS.report).allowed) {
      return fail("rate-limited", "Too many reports");
    }

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile?.bannedAt != null) return fail("suspended", "This account is suspended");

    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const today = await prisma.bugReport.count({ where: { userId, createdAt: { gte: since } } });
    if (today >= REPORT_LIMITS.perDay) return fail("rate-limited", "Enough for one day");

    const { title, body, page, seed } = parsed.data;
    const report = await prisma.bugReport.create({
      data: {
        userId,
        title,
        body,
        ...(page === undefined ? {} : { page }),
        ...(seed === undefined ? {} : { seed }),
      },
      select: { id: true },
    });
    revalidatePath("/[locale]/report", "page");
    return ok({ id: report.id });
  });
}
