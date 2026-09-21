import { getTranslations } from "next-intl/server";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { msUntilNextDaily } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";
import {
  getLeaderboard,
  type LeaderboardEntry,
  type LeaderboardMode,
  type LeaderboardPeriod,
} from "@/lib/leaderboard/queries";
import { getCurrentUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

import { DailyCountdown } from "./DailyCountdown";

/** The board changes every time somebody finishes a run; nothing here caches. */
export const dynamic = "force-dynamic";

const MODES = ["classic", "daily"] as const;
const PERIODS = ["today", "yesterday", "all"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<{ title: string }> {
  const t = await getTranslations("leaderboard");
  return { title: t("title") };
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  const period = parsePeriod(params.period, mode);

  const [t, userId] = await Promise.all([getTranslations("leaderboard"), getCurrentUserId()]);

  // The viewer's profile id, so `getLeaderboard` can find their own best row.
  // A plain read the page can do itself — no server action needed.
  const viewerProfile =
    userId === null
      ? null
      : await prisma.profile.findUnique({ where: { userId }, select: { id: true } });

  const board = await getLeaderboard({
    mode,
    period,
    viewerProfileId: viewerProfile?.id ?? null,
  });

  const me = board.me;
  const pinned =
    me !== null && !board.entries.some((entry) => entry.profileId === me.profileId) ? me : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-8 sm:px-4 sm:py-12">
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>

      {/* Links rather than client state: the page stays a Server Component and
          a board someone shares comes back on the same tab. */}
      <nav className="mt-6 flex items-center gap-1 border-line border-b">
        {MODES.map((value) => (
          <Link
            key={value}
            href={{ pathname: "/leaderboard", query: { mode: value } }}
            aria-current={value === mode ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              value === mode
                ? "border-branch-main text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "classic" ? t("tabClassic") : t("tabDaily")}
          </Link>
        ))}
      </nav>

      {/* The daily is a different board every day, so it is the only mode where
          choosing a day means anything. */}
      {mode === "daily" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-1">
            {PERIODS.map((value) => (
              <Link
                key={value}
                href={{ pathname: "/leaderboard", query: { mode, period: value } }}
                aria-current={value === period ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  value === period
                    ? "bg-panel text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(periodKey(value))}
              </Link>
            ))}
          </nav>

          <DailyCountdown initialMs={msUntilNextDaily(new Date())} />
        </div>
      ) : null}

      {board.entries.length === 0 ? (
        <p className="mt-8 text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="mt-6">
          <Table className="min-w-[34rem]">
            <TableHeader>
              <TableRow className="border-line">
                <TableHead className="w-12 text-right">{t("columnRank")}</TableHead>
                <TableHead>{t("columnPlayer")}</TableHead>
                <TableHead className="text-right">{t("columnScore")}</TableHead>
                <TableHead className="text-right">{t("columnSprints")}</TableHead>
                <TableHead className="text-right">{t("columnBots")}</TableHead>
                <TableHead className="text-right">{t("columnDate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.entries.map((entry) => (
                <Row key={entry.runId} entry={entry} mine={entry.profileId === viewerProfile?.id} />
              ))}
            </TableBody>
            {pinned === null ? null : (
              <TableFooter>
                <TableRow
                  className="border-line border-t-2"
                  aria-label={t("yourRank", { rank: pinned.rank })}
                >
                  <TableCell className="text-right text-branch-main tabular-nums">
                    {pinned.rank}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{pinned.displayName}</TableCell>
                  <TableCell className="text-right tabular-nums">{pinned.score}</TableCell>
                  <TableCell className="text-right tabular-nums">{pinned.sprints}</TableCell>
                  <TableCell className="text-right tabular-nums">{pinned.botsFired}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {day(pinned.finishedAt)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}

function periodKey(period: LeaderboardPeriod): "periodToday" | "periodYesterday" | "periodAll" {
  switch (period) {
    case "today":
      return "periodToday";
    case "yesterday":
      return "periodYesterday";
    case "all":
      return "periodAll";
  }
}

function Row({ entry, mine }: { entry: LeaderboardEntry; mine: boolean }): React.JSX.Element {
  return (
    <TableRow className={cn("border-line", mine && "bg-panel")}>
      <TableCell className={cn("text-right tabular-nums", mine && "text-branch-main")}>
        {entry.rank}
      </TableCell>
      <TableCell className="max-w-40 truncate">{entry.displayName}</TableCell>
      <TableCell className="text-right tabular-nums">{entry.score}</TableCell>
      <TableCell className="text-right tabular-nums">{entry.sprints}</TableCell>
      <TableCell className="text-right tabular-nums">{entry.botsFired}</TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {day(entry.finishedAt)}
      </TableCell>
    </TableRow>
  );
}

/**
 * `YYYY-MM-DD`, cut from the ISO string rather than formatted.
 *
 * A locale-formatted date would need a configured time zone on both sides, and
 * without one the server and the browser disagree and React blows up the
 * hydration. The board is dated in UTC anyway, like `git log --date=short`.
 */
function day(iso: string): string {
  return iso.slice(0, 10);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Anything from a URL is untrusted: an unknown value falls back, never throws. */
function parseMode(raw: string | string[] | undefined): LeaderboardMode {
  const value = first(raw);
  return MODES.find((mode) => mode === value) ?? "classic";
}

function parsePeriod(raw: string | string[] | undefined, mode: LeaderboardMode): LeaderboardPeriod {
  const value = first(raw);
  // Classic runs are compared across all time; a daily only means anything
  // within its own day, so the two boards default differently.
  return PERIODS.find((period) => period === value) ?? (mode === "daily" ? "today" : "all");
}
