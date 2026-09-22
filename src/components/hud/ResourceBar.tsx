"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RunSnapshot } from "@/game";
import { cn } from "@/lib/utils";

/**
 * Energy, debt, production's patience and the sprint clock.
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

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-44 shrink-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-muted-foreground">{t("quality")}</span>
              <span
                className={cn(
                  "tabular-nums",
                  snapshot.quality >= snapshot.qualityMax / 2 && "text-branch-hotfix",
                )}
              >
                {snapshot.quality}/{snapshot.qualityMax}
              </span>
            </div>
            <Progress
              value={(snapshot.quality / snapshot.qualityMax) * 100}
              className="[&>*]:bg-branch-hotfix"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{t("qualityHint")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-52 shrink-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-muted-foreground">
                {common("sprint")}{" "}
                <span className="text-foreground tabular-nums">{snapshot.sprint}</span>
              </span>
              <span className="tabular-nums text-xs">
                {t("sprintTurn", { turn: snapshot.sprintTurn, max: snapshot.sprintTurns })}
              </span>
            </div>
            <Progress
              value={(snapshot.sprintTurn / snapshot.sprintTurns) * 100}
              className="[&>*]:bg-branch-dev"
            />
            <p className="mt-1 text-muted-foreground text-xs">
              {t("releaseIn", { count: Math.max(0, snapshot.sprintTurns - snapshot.sprintTurn) })}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent>{t("sprintHint")}</TooltipContent>
      </Tooltip>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3 text-muted-foreground">
        <span>
          {common("commits")}{" "}
          <span className="text-foreground tabular-nums">{player.totalCommits}</span>
        </span>
        <span>
          {t("delivered")}{" "}
          <span className="text-foreground tabular-nums">{snapshot.ticketsDelivered}</span>
        </span>
        {player.wip > 0 ? (
          <Badge variant="outline" className="border-branch-hotfix text-branch-hotfix">
            {t("wip", { count: player.wip })}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
