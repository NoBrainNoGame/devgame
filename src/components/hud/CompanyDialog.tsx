"use client";

import { useTranslations } from "next-intl";

import { displayTier } from "@/components/hud/displayTier";
import { FinanceChart } from "@/components/hud/FinanceChart";
import { Ladder } from "@/components/hud/Shop";
import { ticketName } from "@/components/hud/ticketName";
import { useGameText, useMoney } from "@/components/hud/useGameText";
import { useTiered } from "@/components/hud/useTiered";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DevView, PlayerAction, RunSnapshot } from "@/game";
import { actionKey } from "@/game";
import {
  ACQUISITION_IDS,
  ACQUISITIONS,
  type AcquisitionId,
  DEV_RANK,
  DEV_RANKS,
} from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * The company: what it earns, where it stands, who works there.
 *
 * Three tabs. Finances is the payday read out in advance — revenue, what the
 * servers can carry, what the subscriptions and the team cost — so the number
 * at the end of the month is never a surprise. The market is the share and
 * the competitors; the team is who to hire and who is there. The shop lives
 * with the skill tree (`UpgradesDialog`): this dialog is where the run is
 * read, that one where it is built. Everything here is free in time, so the
 * dialog stays open across hires.
 */
export function CompanyDialog({
  open,
  onOpenChange,
  snapshot,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const tiered = useTiered(displayTier(snapshot));
  const { economy } = snapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{tiered("company", { seed: snapshot.seed })}</DialogTitle>
          <DialogDescription>
            <span className="text-money tabular-nums">
              {t("money", { money: money(economy.money) })}
            </span>
            {economy.tier > 0 ? ` · ${t("tierBadge", { tier: economy.tier })}` : ""}
            {" · "}
            <span className="text-money">{t("mrr", { money: money(economy.mrr) })}</span>
            {" · "}
            <span className="text-time">{t("paydayIn", { count: economy.paydayIn })}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="finances">
          <TabsList variant="line">
            <TabsTrigger value="finances">{t("finances")}</TabsTrigger>
            <TabsTrigger value="market">
              {t("market")}
              <span className="ml-1 tabular-nums text-muted-foreground">
                {Math.round(economy.share * 100)}%
              </span>
            </TabsTrigger>
            <TabsTrigger value="team">
              {t("team")}
              {snapshot.devs.length > 0 ? (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {snapshot.devs.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="finances" className="pt-3">
            <Finances snapshot={snapshot} onAct={onAct} />
          </TabsContent>
          <TabsContent value="market" className="pt-3">
            <Market snapshot={snapshot} />
          </TabsContent>
          <TabsContent value="team" className="pt-3">
            {snapshot.boosts.freeHire ? <Badge className="mb-3">{t("freeHire")}</Badge> : null}
            <Team snapshot={snapshot} onAct={onAct} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The rung the game would buy, with the button to buy it. The advice the
 * warning toast and the log carry, said once more where the money is.
 */
function Advice({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const { economy } = snapshot;
  if (economy.advice === null) return null;
  const action: PlayerAction = { type: "buy", id: economy.advice.id };
  const offered = snapshot.actions.some((a) => a.type === "buy" && a.id === economy.advice?.id);
  const name = game(`upgrades.${economy.advice.id}.name` as never);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyber/40 bg-cyber/10 p-2 text-xs">
      <span>
        {t("capacityProjected", { projected: economy.projectedLoad })}
        {" · "}
        {offered
          ? t("adviceBuy", { upgrade: name, money: money(economy.advice.cost) })
          : t("adviceUnaffordable", { upgrade: name, money: money(economy.advice.cost) })}
      </span>
      <Button size="sm" variant="default" disabled={!offered} onClick={() => onAct(action)}>
        {t("buyFor", { money: money(economy.advice.cost) })}
      </Button>
    </div>
  );
}

function Finances({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const { economy } = snapshot;
  const saturated = economy.load > economy.capacity;
  const loadPct = Math.min(100, (economy.load / Math.max(1, economy.capacity)) * 100);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm sm:col-span-2">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("financeChart")}
        </h3>
        <FinanceChart history={economy.history} />
      </section>

      <section className="space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("nextPayday")}
        </h3>
        <dl className="space-y-1">
          <Line label={t("lineRevenue")} value={economy.revenue} tone="text-money" />
          {economy.mrr > economy.revenue ? (
            <Line
              label={t("lineLost")}
              value={-(economy.mrr - economy.revenue)}
              tone="text-branch-hotfix"
            />
          ) : null}
          <Line label={t("lineUpkeep")} value={-economy.upkeep} />
          <Line label={t("lineSalaries")} value={-economy.salaries} />
          <div className="flex items-baseline justify-between border-line border-t pt-1 font-medium">
            <dt>{t("lineNet")}</dt>
            <dd
              className={cn("tabular-nums", economy.net < 0 ? "text-branch-hotfix" : "text-money")}
            >
              {money(economy.net, { signed: true })}
            </dd>
          </div>
        </dl>
        <p className="text-time text-xs">
          {t("monthCount", { month: economy.month })} · {t("paydayIn", { count: economy.paydayIn })}
        </p>
      </section>

      <section className="space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("infra")}
        </h3>
        <div className="flex items-baseline justify-between">
          <span>{t("capacity")}</span>
          <span className={cn("tabular-nums", saturated && "text-branch-hotfix")}>
            {economy.load} / {economy.capacity}
          </span>
        </div>
        <Progress value={loadPct} className={cn(saturated && "[&>*]:bg-branch-hotfix")} />
        <p className={cn("text-xs", saturated ? "text-branch-hotfix" : "text-muted-foreground")}>
          {saturated ? t("saturated") : t("capacityHint")}
        </p>
        {economy.alert === "ok" ? null : <Advice snapshot={snapshot} onAct={onAct} />}
        <p className="text-muted-foreground text-xs">
          {t("moneyEarned", { money: money(economy.moneyEarned) })}
          {economy.nextTierAt === null
            ? ""
            : ` · ${t("nextTierAt", { tier: economy.tier + 1, money: money(economy.nextTierAt) })}`}
        </p>
        {economy.nextTierAt === null ? null : (
          <Progress
            value={Math.min(100, (economy.moneyEarned / economy.nextTierAt) * 100)}
            className="h-1.5"
          />
        )}
      </section>
    </div>
  );
}

/**
 * The market: the run's share, what it does to the revenue, and a card per
 * competitor — its bio, its weight, what became of it. The share is the
 * one number here the player can act on, through what customers remember.
 */
function Market({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const { economy, competitors } = snapshot;
  const pct = Math.round(economy.share * 100);
  const multiplier = Math.round(economy.marketMultiplier * 100);

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span>{t("marketShare")}</span>
          <span className="tabular-nums">
            {pct}% · {t("marketMultiplier", { pct: multiplier })}
          </span>
        </div>
        <Progress value={pct} className="[&>*]:bg-cyber" />
        <p className="text-muted-foreground text-xs">{t("marketHint")}</p>
        {economy.priceWarMonths > 0 ? (
          <p className="rounded-md border border-branch-hotfix/40 bg-branch-hotfix/10 p-2 text-branch-hotfix text-xs">
            {t("priceWar", { count: economy.priceWarMonths })}
          </p>
        ) : null}
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {competitors
          .filter((competitor) => competitor.status !== "waiting")
          .map((competitor) => (
            <article
              key={competitor.id}
              className={cn(
                "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
                competitor.status !== "alive" && "opacity-60",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">
                  {game(`competitors.${competitor.id}.name` as never)}
                </span>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {competitor.status === "alive"
                    ? `${Math.round(competitor.share * 100)}%`
                    : t(`competitorStatus.${competitor.status}`)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {game(`competitors.${competitor.id}.bio` as never)}
              </p>
              {competitor.mergedInto === undefined ? null : (
                <p className="text-muted-foreground text-xs">
                  {t("mergedInto", {
                    company: game(`competitors.${competitor.mergedInto}.name` as never),
                  })}
                </p>
              )}
            </article>
          ))}
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const money = useMoney();
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", tone)}>{money(value, { signed: true })}</dd>
    </div>
  );
}

function Team({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const render = useGameText();

  const { seats, tier } = snapshot.economy;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("hire")}
          </h3>
          <span
            className={cn(
              "text-xs tabular-nums",
              seats.used >= seats.max ? "text-branch-hotfix" : "text-muted-foreground",
            )}
          >
            {t("seats", { used: seats.used, max: seats.max })}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t("hireHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEV_RANKS.map((rank) => {
            const action: PlayerAction = { type: "hire", rank };
            const offered = snapshot.actions.some((a) => a.type === "hire" && a.rank === rank);
            const preview = snapshot.previews[actionKey(action)];
            const locked = DEV_RANK[rank].tier > tier;
            return (
              <article
                key={rank}
                className={cn(
                  "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
                  locked && "opacity-60",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{game(`ranks.${rank}.name` as never)}</p>
                  {locked ? (
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {t("nextTier", { tier: DEV_RANK[rank].tier })}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("rankCapacity", { count: DEV_RANK[rank].capacity })}
                  {" · "}
                  {t("rankSpeed", { count: DEV_RANK[rank].speed })}
                  {" · "}
                  {t("rankSalary", { money: money(DEV_RANK[rank].salary) })}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block">
                      <Button
                        size="sm"
                        variant={offered ? "default" : "outline"}
                        className="w-full"
                        disabled={!offered}
                        onClick={() => onAct(action)}
                      >
                        {t("buyFor", { money: money(snapshot.economy.hireCosts[rank]) })}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {preview?.notes.length ? (
                    <TooltipContent side="bottom">
                      {preview.notes.map((note) => (
                        <p key={note.key}>{render(note)}</p>
                      ))}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("sites")}
        </h3>
        <p className="text-muted-foreground text-xs">{t("sitesHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Ladder category="org" snapshot={snapshot} onAct={onAct} />
        </div>
      </section>

      {ACQUISITION_IDS.some((id) => ACQUISITIONS[id].tier <= tier + 1) ? (
        <section className="space-y-2">
          <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("acquisitions")}
          </h3>
          <p className="text-muted-foreground text-xs">{t("acquisitionsHint")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACQUISITION_IDS.filter((id) => ACQUISITIONS[id].tier <= tier + 1).map((id) => (
              <AcquisitionCard key={id} id={id} snapshot={snapshot} onAct={onAct} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("roster")}
        </h3>
        {snapshot.devs.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("rosterEmpty")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {snapshot.devs.map((dev) => (
              <DevCard key={dev.id} dev={dev} snapshot={snapshot} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AcquisitionCard({
  id,
  snapshot,
  onAct,
}: {
  id: AcquisitionId;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const render = useGameText();
  const def = ACQUISITIONS[id];
  const bought = snapshot.economy.acquisitions.includes(id);
  const locked = def.tier > snapshot.economy.tier;
  const action: PlayerAction = { type: "acquire", id };
  const offered = snapshot.actions.some((a) => a.type === "acquire" && a.id === id);
  const preview = snapshot.previews[actionKey(action)];

  return (
    <article
      className={cn(
        "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
        bought && "border-branch-main/60",
        locked && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{game(`acquisitions.${id}.name` as never)}</span>
        {locked ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            {t("nextTier", { tier: def.tier })}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {game(`acquisitions.${id}.desc` as never)}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">
            <Button
              size="sm"
              variant={offered ? "default" : "outline"}
              className="w-full"
              disabled={!offered}
              onClick={() => onAct(action)}
            >
              {bought ? t("acquired") : t("buyFor", { money: money(def.cost) })}
            </Button>
          </span>
        </TooltipTrigger>
        {preview?.notes.length ? (
          <TooltipContent side="bottom">
            {preview.notes.map((note) => (
              <p key={note.key}>{render(note)}</p>
            ))}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </article>
  );
}

function DevCard({ dev, snapshot }: { dev: DevView; snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const held = snapshot.tickets.filter((ticket) => ticket.assignee === dev.id);

  return (
    <article className="space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: `var(--color-dev-${dev.colour})` }}
          />
          <span style={{ color: `var(--color-dev-${dev.colour})` }}>{dev.name}</span>
          <span className="text-muted-foreground">· {game(`ranks.${dev.rank}.name` as never)}</span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("rankSalary", { money: money(dev.salary) })}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("devHolds", { count: held.length, max: dev.capacity })}
        {" · "}
        {t("devDelivered", { count: dev.delivered })}
        {dev.promotionIn === null ? "" : ` · ${t("promotionIn", { count: dev.promotionIn })}`}
      </p>
      {held.map((ticket) => (
        <div key={ticket.id} className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span>
              #{ticket.id.slice(1)}{" "}
              {ticket.skillId === undefined
                ? ticketName(game, ticket)
                : game(`skills.${ticket.skillId}.name` as never)}
            </span>
            <span className="tabular-nums">
              {ticket.filled}/{ticket.points}
            </span>
          </div>
          <Progress value={(ticket.filled / Math.max(1, ticket.points)) * 100} className="h-1.5" />
        </div>
      ))}
    </article>
  );
}
