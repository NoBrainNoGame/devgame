import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { getMultiBoard } from "@/lib/multi/queries";
import { alternatesFor } from "@/lib/seo";

/** The board changes every round; nothing here caches. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("multi.board")]);
  return {
    title: t("title"),
    alternates: alternatesFor(env.APP_URL, locale, "/multi/leaderboard"),
  };
}

/**
 * Every company of the world and every developer in them, best first. A page
 * of the site and not of the stage: it scrolls, ends in the footer, and is
 * read by people who are not playing.
 */
export default async function MultiLeaderboardPage(): Promise<React.JSX.Element> {
  if (!env.MULTI) notFound();
  const [t, board] = await Promise.all([getTranslations("multi.board"), getMultiBoard()]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-display font-bold text-2xl text-cyber uppercase tracking-[0.12em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        <Link href="/multi" className="text-cyber text-sm underline-offset-4 hover:underline">
          {t("play")}
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("companies")}
        </h2>
        {board.companies.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("rank")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="text-right">{t("members")}</TableHead>
                <TableHead className="text-right">{t("score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.companies.map((company, index) => (
                <TableRow key={company.id}>
                  <TableCell className="tabular-nums">{index + 1}</TableCell>
                  <TableCell>{company.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{company.members}</TableCell>
                  <TableCell className="text-right tabular-nums">{company.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("players")}
        </h2>
        {board.players.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("rank")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("company")}</TableHead>
                <TableHead className="text-right">{t("score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.players.map((player, index) => (
                <TableRow key={`${player.profileId}:${player.company}`}>
                  <TableCell className="tabular-nums">{index + 1}</TableCell>
                  <TableCell>{player.name}</TableCell>
                  <TableCell className="text-muted-foreground">{player.company}</TableCell>
                  <TableCell className="text-right tabular-nums">{player.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
