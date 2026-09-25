"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";

import { displayTier } from "@/components/hud/displayTier";
import { useMoney } from "@/components/hud/useGameText";
import { useTiered } from "@/components/hud/useTiered";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetaProgressDto, RunSaveDto, RunSnapshot } from "@/game";
import { useGameStore } from "@/game";
import { HEALTH_MAX, healthOf, healthText, patienceOf } from "@/game/bridge/gauges";

/**
 * The run left in progress, as it stands: the graph it has drawn so far and
 * the figures a player needs to decide whether to go back to it — where the
 * sprint is, what the company is worth, how close the gauges are to the end.
 * The figures are the engine's: the preview replays the save and publishes
 * it like any run.
 */
const RunPreview = dynamic(
  () => import("@/components/game/RunPreview").then((module) => module.RunPreview),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> },
);

export function ResumePanel({
  save,
  meta,
  playerName,
  onResume,
}: {
  save: RunSaveDto;
  meta: MetaProgressDto;
  playerName: string;
  onResume: () => void;
}) {
  const t = useTranslations("play");
  const game = useTranslations("game");
  const format = useFormatter();
  const snapshot = useGameStore((state) => state.snapshot);

  return (
    <section className="flex min-w-0 flex-col gap-4 border border-branch-feature/40 bg-panel/60 p-4">
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

      <div className="relative h-[min(52dvh,30rem)] min-h-64 overflow-hidden border border-line bg-bg">
        <RunPreview save={save} meta={meta} playerName={playerName} />
      </div>

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
