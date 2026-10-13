"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/realtime/client/store";

/**
 * The ranking, always on the HUD: the three best companies, where this one
 * stands, and where this player stands among everyone. The full page is a click.
 */
export function MiniRanking(): React.JSX.Element {
  const t = useTranslations("multi.ranking");
  const ranking = useRealtime((state) => state.ranking);
  const top = ranking?.companies.slice(0, 3) ?? [];

  return (
    <section className="space-y-1.5 text-xs">
      <h3 className="hud-title font-medium text-muted-foreground uppercase tracking-wider">
        {t("title")}
      </h3>
      {top.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="space-y-0.5">
          {top.map((company, index) => (
            <li
              key={company.id}
              className={cn(
                "flex items-center gap-2",
                company.id === ranking?.mine.companyId && "text-cyber",
              )}
            >
              <span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{company.name}</span>
              <span className="tabular-nums">{company.score}</span>
            </li>
          ))}
        </ol>
      )}
      {ranking === null || ranking.mine.companyRank === 0 ? null : (
        <p className="text-muted-foreground">
          {t("company", { rank: ranking.mine.companyRank, total: ranking.mine.companyTotal })}
        </p>
      )}
      {ranking === null || ranking.mine.playerRank === 0 ? null : (
        <p className="text-muted-foreground">
          {t("player", { rank: ranking.mine.playerRank, total: ranking.mine.playerTotal })}
        </p>
      )}
      <Link href="/multi/leaderboard" className="text-cyber underline-offset-4 hover:underline">
        {t("link")}
      </Link>
    </section>
  );
}
