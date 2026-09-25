"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { displayTier } from "@/components/hud/displayTier";
import { FinanceChart } from "@/components/hud/FinanceChart";
import { useMoney } from "@/components/hud/useGameText";
import { useTiered } from "@/components/hud/useTiered";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunSaveDto, RunSnapshot } from "@/game";
import { HEALTH_MAX, healthOf, healthText, patienceOf } from "@/game/bridge/gauges";
import { snapshotOfSave } from "@/game/bridge/rebuild";

/**
 * The run left in progress, as it stands: its paydays drawn as the finances
 * tab draws them — cash, revenue, market share — and the figures a player
 * needs to decide whether to go back to it: where the sprint is, what the
 * company is worth, how close the gauges are to the end. All of it is the
 * engine's, from the save replayed here: the save itself holds nothing but
 * the seed and the actions.
 */
export function ResumePanel({ save, onResume }: { save: RunSaveDto; onResume: () => void }) {
  const t = useTranslations("play");
  const hud = useTranslations("hud");
  const game = useTranslations("game");
  const format = useFormatter();
  // Replayed after the first paint, not during it: about a fifth of a
  // millisecond an action, so a tenth of a second for a long run — the rest
  // of the screen need not wait for it.
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(snapshotOfSave(save));
  }, [save]);

  return (
    <section className="flex min-w-0 flex-col gap-4 self-start border border-branch-feature/40 bg-panel/60 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="hud-title font-medium text-lg">{t("resumeTitle")}</h2>
        <p className="text-muted-foreground text-xs">
          {game(`profiles.${save.profileId}.name` as never)}
          {" · "}
          {save.mode === "daily" ? t("modeDaily") : t("modeClassic")}
          {" · "}
          {t("resumeStarted", {
            date: format.dateTime(new Date(save.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
          {" · "}
          {t("resumeActions", { count: save.actions.length })}
        </p>
      </header>

      <section className="space-y-2 border border-line bg-bg/60 p-3">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {hud("financeChart")}
        </h3>
        {snapshot === null ? (
          <Skeleton className="aspect-[640/140] w-full" />
        ) : (
          <FinanceChart history={snapshot.economy.history} />
        )}
      </section>

      {snapshot === null ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <Figures snapshot={snapshot} />
      )}

      <Button size="lg" className="self-start" onClick={onResume}>
        {t("resume")}
      </Button>
    </section>
  );
}

function Figures({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("play");
  const hud = useTranslations("hud");
  const common = useTranslations("common");
  const money = useMoney();
  const tiered = useTiered(displayTier(snapshot));
  const { economy, player } = snapshot;
  const health = healthOf(snapshot.debt);
  const patience = patienceOf(snapshot.quality, snapshot.qualityMax);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Figure label={common("sprint")}>
          {snapshot.sprint}
          <span className="ml-1 text-muted-foreground text-xs">
            {hud("sprintTurn", { turn: snapshot.sprintTurn, max: snapshot.sprintTurns })}
          </span>
        </Figure>
        <Figure label={hud("finances")}>
          {money(economy.money)}
          <span
            className={
              economy.net < 0 ? "ml-1 text-branch-hotfix text-xs" : "ml-1 text-branch-main text-xs"
            }
          >
            {money(economy.net, { signed: true })}/{hud("monthShort")}
          </span>
        </Figure>
        <Figure label={hud("marketShare")}>
          {Math.round(economy.share * 100)}%
          {economy.tier > 0 ? (
            <span className="ml-1 text-branch-feature text-xs">
              {hud("tierBadge", { tier: economy.tier })}
            </span>
          ) : null}
        </Figure>
        <Figure label={t("ticketsDelivered")}>{snapshot.ticketsDelivered}</Figure>
        <Figure label={common("commits")}>{player.totalCommits}</Figure>
        <Figure label={hud("team")}>{snapshot.devs.length}</Figure>
      </dl>

      <div className="space-y-2 text-sm">
        <Meter
          label={tiered("energyLabel")}
          value={`${player.energy}/${player.energyMax}`}
          pct={player.energyMax === 0 ? 0 : (player.energy / player.energyMax) * 100}
          barClassName="[&>*]:bg-primary"
        />
        <Meter
          label={common("codeHealth")}
          value={healthText(health)}
          pct={(health.range[0] / HEALTH_MAX) * 100}
          barClassName="[&>*]:bg-debt"
        />
        <Meter
          label={tiered("patience")}
          value={`${patience}/${snapshot.qualityMax}`}
          pct={(patience / snapshot.qualityMax) * 100}
          barClassName="[&>*]:bg-branch-main"
        />
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Meter({
  label,
  value,
  pct,
  barClassName,
}: {
  label: string;
  value: string;
  pct: number;
  barClassName: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Progress value={pct} className={barClassName} />
    </div>
  );
}
