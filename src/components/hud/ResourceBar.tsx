"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RunSnapshot } from "@/game";
import { cn } from "@/lib/utils";

/**
 * Energy, debt and the sprint clock.
 *
 * Debt is shown as a band unless something in the build reveals it. That is the
 * design's answer to a gauge that used to be invisible: hidden enough to be a
 * risk, visible enough to be a decision.
 */
export function ResourceBar({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const common = useTranslations("common");

  const { player, debt } = snapshot;
  const energyPct = player.energyMax === 0 ? 0 : (player.energy / player.energyMax) * 100;

  return (
    <div className="flex flex-wrap items-center gap-4 border-line border-b bg-panel/60 px-4 py-2 text-sm">
      <div className="w-56 shrink-0">
        <div className="mb-1 flex items-baseline justify-between">
          <span className={cn("text-muted-foreground", player.crunch && "text-energy")}>
            {common("energy")}
          </span>
          <span className="tabular-nums">
            {player.energy}/{player.energyMax}
          </span>
        </div>
        <Progress value={energyPct} className={cn(player.crunch && "[&>*]:bg-energy")} />
        {player.crunch ? <p className="mt-1 text-energy text-xs">{t("crunchHint")}</p> : null}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-44 shrink-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-muted-foreground">{common("debt")}</span>
              <span className="tabular-nums text-debt">
                {debt.exact === null ? `${debt.range[0]}–${debt.range[1]}` : debt.exact}
              </span>
            </div>
            <Progress value={debt.range[1]} className="[&>*]:bg-debt" />
          </div>
        </TooltipTrigger>
        <TooltipContent>{t("debtHint")}</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3 text-muted-foreground">
        <span>
          {common("sprint")} <span className="text-foreground tabular-nums">{snapshot.sprint}</span>
        </span>
        <span>
          {common("turn")} <span className="text-foreground tabular-nums">{snapshot.turn}</span>
        </span>
        <span>
          {common("commits")}{" "}
          <span className="text-foreground tabular-nums">{player.totalCommits}</span>
        </span>
        {player.unreviewed > 0 ? (
          <Badge variant="outline" className="border-debt text-debt">
            {t("unreviewed", { count: player.unreviewed })}
          </Badge>
        ) : null}
        {player.overextended ? (
          <Badge variant="outline" className="border-branch-hotfix text-branch-hotfix">
            {t("overextended")}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
