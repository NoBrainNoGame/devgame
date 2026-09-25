"use client";

import { Building2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { AnimatedCounter } from "@/components/hud/AnimatedCounter";
import { AnimatedGauge } from "@/components/hud/AnimatedGauge";
import { displayTier } from "@/components/hud/displayTier";
import { useMoney } from "@/components/hud/useGameText";
import { useShownGauges } from "@/components/hud/useShownGauges";
import { useTiered } from "@/components/hud/useTiered";
import { GameSettingsButton } from "@/components/settings/GameSettings";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RunSnapshot } from "@/game";
import { HEALTH_MAX, healthOf, healthText } from "@/game/bridge/gauges";
import { OBJECTIVES } from "@/game/content";
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
  onOpenUpgrades,
  upgradesNews,
}: {
  snapshot: RunSnapshot;
  onOpenCompany: () => void;
  onOpenUpgrades: () => void;
  /** Something on offer in the upgrades dialog the player has not seen yet. */
  upgradesNews: boolean;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const money = useMoney();
  const common = useTranslations("common");
  const tiered = useTiered(displayTier(snapshot));

  const { player, debt, economy } = snapshot;
  // Full when all is well: the code's health is the debt turned over, and
  // production's patience is its impatience turned over. The gauges show
  // what the canvas has told so far: a figure still to rise holds its gauge.
  const shown = useShownGauges(snapshot);
  const health = shown.health;
  const patience = shown.patience;
  // The objective's own figure is the run as it stands, not the story.
  const liveHealth = healthOf(debt);
  // The debt objective reads in the same terms as the gauge it watches.
  const objectiveParams =
    snapshot.objective?.id === "debt_under"
      ? { progress: healthText(liveHealth), target: HEALTH_MAX - snapshot.objective.target }
      : snapshot.objective === null
        ? null
        : { progress: snapshot.objective.progress, target: snapshot.objective.target };
  const saturated = economy.load > economy.capacity;
  const energyPct = player.energyMax === 0 ? 0 : (shown.energy / player.energyMax) * 100;

  return (
    <div className="grid grid-cols-1 items-center gap-4 border-line border-b bg-panel/60 px-4 py-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
      {/* Left: the sprint clock. Centre: the three gauges. Right: the company and the upgrades. */}
      <div className="flex justify-start">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-52 shrink-0">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-muted-foreground">
                  {common("sprint")}{" "}
                  <span className="text-time tabular-nums">{snapshot.sprint}</span>
                </span>
                <span className="text-time tabular-nums text-xs">
                  {t("sprintTurn", { turn: snapshot.sprintTurn, max: snapshot.sprintTurns })}
                </span>
              </div>
              <Progress
                value={(snapshot.sprintTurn / snapshot.sprintTurns) * 100}
                className="[&>*]:bg-time"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                {t("releaseIn", { count: Math.max(0, snapshot.sprintTurns - snapshot.sprintTurn) })}
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent>{t("sprintHint")}</TooltipContent>
        </Tooltip>
        {snapshot.objective === null ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "ml-3 hidden w-44 shrink-0 self-center rounded-md border px-2 py-1 text-xs sm:block",
                  snapshot.objective.met
                    ? "border-branch-main/60 text-branch-main"
                    : "border-line text-muted-foreground",
                )}
              >
                <span className="block truncate">
                  {game(`objectives.${snapshot.objective.id}.name` as never)}
                </span>
                <span className="tabular-nums">
                  {t(`objectiveProgress.${snapshot.objective.id}`, objectiveParams ?? {})}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {game(
                `objectives.${snapshot.objective.id}.desc` as never,
                {
                  target: objectiveParams?.target ?? snapshot.objective.target,
                } as never,
              )}
              {" · "}
              {t(`objectiveReward.${OBJECTIVES[snapshot.objective.id].reward}`)}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="w-56 shrink-0">
          <div className="mb-1 flex items-baseline justify-between">
            <span className={cn("text-muted-foreground", player.crunch && "text-branch-hotfix")}>
              {tiered("energyLabel")}
            </span>
            <span className="text-energy tabular-nums">
              {shown.energy}/{player.energyMax}
            </span>
          </div>
          <AnimatedGauge
            gauge="energy"
            value={energyPct}
            // Energy is yellow; the crunch, energy run dry, is a problem's red.
            barClassName={player.crunch ? "bg-branch-hotfix" : "bg-energy"}
          />
          {player.crunch ? (
            <p className="mt-1 text-branch-hotfix text-xs">{t("crunchHint")}</p>
          ) : null}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-44 shrink-0">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-muted-foreground">{common("codeHealth")}</span>
                <span className="tabular-nums text-debt">{healthText(health)}</span>
              </div>
              {/* Solid to the worst the blur allows, faint to the best: a gauge that
                  promises more than it knows is a lie. */}
              <AnimatedGauge
                gauge="health"
                value={(health.range[0] / HEALTH_MAX) * 100}
                upper={(health.range[1] / HEALTH_MAX) * 100}
                barClassName="bg-debt"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>{t("codeHealthHint")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-44 shrink-0">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-muted-foreground">{tiered("patience")}</span>
                <span
                  className={cn(
                    "text-patience tabular-nums",
                    patience <= snapshot.qualityMax / 2 && "text-branch-hotfix",
                  )}
                >
                  {patience}/{snapshot.qualityMax}
                </span>
              </div>
              <AnimatedGauge
                gauge="patience"
                value={(patience / snapshot.qualityMax) * 100}
                barClassName="bg-patience"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>{tiered("patienceHint")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="shrink-0" onClick={onOpenCompany}>
              <Building2 className="size-4" />
              <AnimatedCounter
                gauge="money"
                value={shown.money}
                className="text-money tabular-nums"
              >
                {t("money", { money: money(shown.money) })}
              </AnimatedCounter>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  economy.net < 0 ? "text-branch-hotfix" : "text-money",
                )}
              >
                {economy.net >= 0 ? "+" : ""}
                {money(economy.net)}/{t("monthShort")}
              </span>
              {economy.tier > 0 ? (
                <span className="rounded-full bg-cyber/15 px-1.5 text-cyber text-xs tabular-nums">
                  {t("tierBadge", { tier: economy.tier })}
                </span>
              ) : null}
              <span className="text-muted-foreground text-xs tabular-nums">
                {t("shareShort", { pct: Math.round(economy.share * 100) })}
              </span>
              {saturated ? (
                <span className="rounded-full bg-branch-hotfix/20 px-1.5 text-branch-hotfix text-xs">
                  {t("saturatedShort")}
                </span>
              ) : economy.alert === "warning" ? (
                <span className="rounded-full border border-branch-hotfix/50 px-1.5 text-branch-hotfix text-xs">
                  {t("capacityWarning")}
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
              variant="outline"
              className={cn("shrink-0", upgradesNews && "upgrades-ready")}
              onClick={onOpenUpgrades}
            >
              <Sparkles className="size-4" />
              {t("upgrades")}
              <AnimatedCounter
                gauge="skills"
                value={shown.skills}
                className="text-muted-foreground text-xs tabular-nums"
              >
                {t("skillsShort", { count: shown.skills })}
              </AnimatedCounter>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {upgradesNews ? t("upgradesReadyHint") : t("upgradesButtonHint")}
          </TooltipContent>
        </Tooltip>

        <GameSettingsButton />
      </div>
    </div>
  );
}
