"use client";

import { Building2, GitBranchPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMoney } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
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
export function ResourceBar({
  snapshot,
  onOpenCompany,
  onOpenTree,
}: {
  snapshot: RunSnapshot;
  onOpenCompany: () => void;
  onOpenTree: () => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const common = useTranslations("common");

  const { player, debt, economy } = snapshot;
  const saturated = economy.load > economy.capacity;
  const energyPct = player.energyMax === 0 ? 0 : (player.energy / player.energyMax) * 100;

  return (
    <div className="grid grid-cols-1 items-center gap-4 border-line border-b bg-panel/60 px-4 py-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
      {/* Left: the sprint clock. Centre: the three gauges. Right: money and the tree. */}
      <div className="flex justify-start">
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
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
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
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="shrink-0" onClick={onOpenCompany}>
              <Building2 className="size-4" />
              <span className="tabular-nums">{t("money", { money: money(economy.money) })}</span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  economy.net < 0 ? "text-branch-hotfix" : "text-branch-main",
                )}
              >
                {economy.net >= 0 ? "+" : ""}
                {money(economy.net)}/{t("monthShort")}
              </span>
              {economy.tier > 0 ? (
                <span className="rounded-full bg-branch-feature/20 px-1.5 text-branch-feature text-xs tabular-nums">
                  {t("tierBadge", { tier: economy.tier })}
                </span>
              ) : null}
              {saturated ? (
                <span className="rounded-full bg-branch-hotfix/20 px-1.5 text-branch-hotfix text-xs">
                  {t("saturatedShort")}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("companyHint", { count: economy.paydayIn })}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={snapshot.actions.some((a) => a.type === "tree") ? "default" : "outline"}
              className="shrink-0"
              onClick={onOpenTree}
            >
              <GitBranchPlus className="size-4" />
              {t("treePoints", { count: snapshot.skillPoints })}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("treeHint")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
