import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";
import { getSession } from "@/lib/session";

import { ReportForm } from "./ReportForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("report")]);
  return {
    title: t("title"),
    alternates: alternatesFor(env.APP_URL, locale, "/report"),
    robots: { index: false, follow: false },
  };
}

/** How many of the player's latest runs the form offers the seed of. */
const RECENT_RUNS = 3;

/**
 * Where a signed-in player says what broke. Offline there is nobody to tell;
 * signed out, the login page comes first. The form offers the seeds of the
 * player's last few runs, dated, so naming the run is a pick rather than a
 * copy; the player sees their own reports and their status, nothing anyone
 * else wrote.
 */
export default async function ReportPage(): Promise<React.JSX.Element> {
  if (!env.ONLINE) notFound();
  const locale = await getLocale();
  const session = (await getSession()) ?? redirect({ href: "/login", locale });
  const t = await getTranslations("report");

  const [profile, mine, runs] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: session.user.id }, select: { bannedAt: true } }),
    prisma.bugReport.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, status: true, createdAt: true },
    }),
    prisma.run.findMany({
      where: { profile: { userId: session.user.id } },
      orderBy: { updatedAt: "desc" },
      take: RECENT_RUNS,
      select: { seed: true, mode: true, updatedAt: true },
    }),
  ]);
  const suspended = profile?.bannedAt != null;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const recent = runs.map((run) => ({
    seed: run.seed,
    label: `${run.seed} · ${when.format(run.updatedAt)}${run.mode === "daily" ? ` · ${t("seedDaily")}` : ""}`,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4 sm:py-12">
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground text-sm">{t("intro")}</p>

      {suspended ? (
        <p className="mt-6 rounded-md border border-branch-hotfix/40 bg-branch-hotfix/10 p-3 text-sm">
          {t("suspended")}
        </p>
      ) : (
        <div className="mt-6">
          <ReportForm recent={recent} />
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("mine")}
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">{t("mineEmpty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {mine.map((report) => (
              <li
                key={report.id}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{report.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
                  <span className="tabular-nums">
                    {report.createdAt.toISOString().slice(0, 10)}
                  </span>
                  <Badge variant="outline">{t(`status.${report.status}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
