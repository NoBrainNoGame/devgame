import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RULES_EPOCH, RULES_EPOCHS, rulesEpochOf } from "@/game";
import { Link } from "@/i18n/navigation";
import { msUntilNextDaily } from "@/lib/daily/seed";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  getLeaderboard,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardMode,
  type LeaderboardPeriod,
} from "@/lib/leaderboard/queries";
import { alternatesFor } from "@/lib/seo";
import { getCurrentUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

import { DailyCountdown } from "./DailyCountdown";

/** The board changes every time somebody finishes a run; nothing here caches. */
export const dynamic = "force-dynamic";

const MODES = ["classic", "daily"] as const;
const PERIODS = ["today", "yesterday", "all"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("leaderboard")]);

  return {
    title: t("title"),
    alternates: alternatesFor(env.APP_URL, locale, "/leaderboard"),
  };
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  const period = parsePeriod(params.period, mode);
  const epoch = parseEpoch(params.epoch);
  const query = (next: { mode?: LeaderboardMode; period?: LeaderboardPeriod; epoch?: number }) =>
    boardQuery({ mode, period, epoch, ...next });

  const [t, userId] = await Promise.all([getTranslations("leaderboard"), getCurrentUserId()]);

  // The board is a mirror, not the game: a database that is down, or behind
  // on its migrations, must not take the page down with it. The error goes to
  // the server log, where it names the cause; the page says only that the
  // board is unavailable.
  const { viewerProfile, board, unavailable } = env.ONLINE
    ? await loadBoard(mode, period, epoch, userId)
    : { viewerProfile: null, board: { entries: [], me: null }, unavailable: "offline" as const };

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
            href={{ pathname: "/leaderboard", query: query({ mode: value, period: undefined }) }}
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

      {/* One board per rules generation: a run from before a rules change is
          a different game, so the old boards stay readable on their own. */}
      <nav className="mt-3 flex flex-wrap items-center gap-1" aria-label={t("epochs")}>
        <span className="px-1 text-muted-foreground text-xs">{t("epochs")}</span>
        {RULES_EPOCHS.map((row) => (
          <Link
            key={row.epoch}
            href={{ pathname: "/leaderboard", query: query({ epoch: row.epoch }) }}
            aria-current={row.epoch === epoch ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1 text-xs tabular-nums transition-colors",
              row.epoch === epoch
                ? "bg-panel text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("epoch", { epoch: row.epoch, version: row.version, date: row.releasedAt })}
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
                href={{ pathname: "/leaderboard", query: query({ period: value }) }}
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

      {unavailable !== false ? (
        <p className="mt-8 text-muted-foreground text-sm">
          {unavailable === "offline" ? t("offline") : t("unavailable")}
        </p>
      ) : board.entries.length === 0 ? (
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
                <TableHead className="text-right">{t("columnTickets")}</TableHead>
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
                  <TableCell className="text-right tabular-nums">
                    {pinned.ticketsDelivered}
                  </TableCell>
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

/**
 * The viewer's profile id — so `getLeaderboard` can find their own best row, a
 * plain read the page does itself — then the board. One try around both:
 * either query failing means the same thing to the reader.
 */
async function loadBoard(
  mode: LeaderboardMode,
  period: LeaderboardPeriod,
  epoch: number,
  userId: string | null,
): Promise<{
  viewerProfile: { id: string } | null;
  board: Leaderboard;
  unavailable: false | "down" | "offline";
}> {
  try {
    const viewerProfile =
      userId === null
        ? null
        : await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    const board = await getLeaderboard({
      mode,
      period,
      epoch,
      viewerProfileId: viewerProfile?.id ?? null,
    });
    return { viewerProfile, board, unavailable: false as const };
  } catch (error) {
    console.error(
      "Leaderboard query failed — is the database up and migrated (`bun run db:up`, `bun run db:deploy`)?",
      error,
    );
    return { viewerProfile: null, board: { entries: [], me: null }, unavailable: "down" as const };
  }
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
      <TableCell className="text-right tabular-nums">{entry.ticketsDelivered}</TableCell>
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

/** An epoch the boards know, or the one in force. */
function parseEpoch(raw: string | string[] | undefined): number {
  const value = Number(first(raw));
  return rulesEpochOf(value)?.epoch ?? RULES_EPOCH;
}

/**
 * The query string a board link carries. The defaults stay out of it — the
 * current epoch, the mode's own default period — so a shared link reads as
 * it always has.
 */
function boardQuery(state: {
  mode: LeaderboardMode;
  period: LeaderboardPeriod | undefined;
  epoch: number;
}): Record<string, string> {
  const out: Record<string, string> = { mode: state.mode };
  if (state.period !== undefined) out.period = state.period;
  if (state.epoch !== RULES_EPOCH) out.epoch = String(state.epoch);
  return out;
}
