"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { FinanceChart } from "@/components/hud/FinanceChart";
import { IdleBar } from "@/components/hud/IdleBar";
import { useGameText, useMoney } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, QualitySource, RunSnapshot } from "@/game";
import { actionKey, useGameStore } from "@/game";
import { NARRATIVE_EVENTS } from "@/game/content";

/** A review being read has the floor: the other questions wait for it. */
function useReviewing(): boolean {
  return useGameStore((state) => state.pendingReview !== null);
}

/**
 * The moments the game stops and asks a direct question: how to untangle a
 * merge conflict, which improvement to take into the next sprint, and what to
 * do now the run is over. All modal, because each is the only thing that can
 * happen next — and all of them wait for the canvas to finish telling what
 * just happened, or the question would land on top of its own cause.
 */
export function ConflictDialog({
  snapshot,
  busy,
  onAct,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const reviewing = useReviewing();
  const open = snapshot.phase.kind === "resolve_conflict" && !busy && !reviewing;

  const manual = snapshot.previews["conflict:manual"];
  const machine = snapshot.previews["conflict:ai"];

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("conflictTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          <div className="relative">
            <Button
              variant="outline"
              className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
              disabled={busy}
              onClick={() => onAct({ type: "resolve_conflict", how: "manual" })}
            >
              <span>
                {t("conflictManual")}
                {manual === undefined
                  ? ""
                  : `\u00a0— −${manual.energyCost}\u00a0⚡ · ${manual.successPct ?? 0}\u00a0%`}
              </span>
              <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                {t("conflictManualHint")}
              </span>
            </Button>
            <IdleBar action={{ type: "resolve_conflict", how: "manual" }} />
          </div>

          <Button
            variant="outline"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
            disabled={busy}
            onClick={() => onAct({ type: "resolve_conflict", how: "ai" })}
          >
            <span>
              {t("conflictAi")}
              {machine?.debtDelta === undefined ? "" : `\u00a0— +${machine.debtDelta[1]} dette`}
            </span>
            <span className="whitespace-normal font-normal text-muted-foreground text-xs">
              {t("conflictAiHint")}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RelicDialog({
  snapshot,
  busy,
  onAct,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  const reviewing = useReviewing();
  const open = snapshot.phase.kind === "choose_relic" && !busy && !reviewing;
  const offer = snapshot.phase.kind === "choose_relic" ? snapshot.phase.offer : [];

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("relicTitle")}</DialogTitle>
          <DialogDescription>{t("relicSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {offer.map((relicId) => (
            <div key={relicId} className="relative">
              <Button
                variant="outline"
                className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
                disabled={busy}
                onClick={() => onAct({ type: "choose_relic", relicId })}
              >
                <span>{game(`relics.${relicId}.name` as never)}</span>
                <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                  {game(`relics.${relicId}.desc` as never)}
                </span>
              </Button>
              <IdleBar action={{ type: "choose_relic", relicId }} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Something happened to the company and asks it a question. The text
 * names the competitor or the developer it is about; each answer shows
 * what it does before it is taken, and the clock's bar sits on the first.
 */
export function EventDialog({
  snapshot,
  busy,
  onAct,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const render = useGameText();

  const reviewing = useReviewing();
  const open = snapshot.phase.kind === "event" && !busy && !reviewing;
  const phase = snapshot.phase.kind === "event" ? snapshot.phase : null;
  if (phase === null) return null;
  const def = NARRATIVE_EVENTS[phase.eventId];
  const params = {
    competitor:
      phase.competitorId === undefined
        ? ""
        : game(`competitors.${phase.competitorId}.name` as never),
    dev: phase.devId ?? "",
  };

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="mr-2 rounded-full bg-muted px-2 py-0.5 font-normal text-muted-foreground text-xs">
              {t(`eventSource.${def.source}`)}
            </span>
            {game(`narrative.${phase.eventId}.title` as never, params as never)}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {game(`narrative.${phase.eventId}.text` as never, params as never)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {def.choices.map((choice) => {
            const action: PlayerAction = {
              type: "answer",
              eventId: phase.eventId,
              choice: choice.id,
            };
            const offered = snapshot.actions.some(
              (a) => a.type === "answer" && a.choice === choice.id,
            );
            const preview = snapshot.previews[actionKey(action)];
            return (
              <div key={choice.id} className="relative">
                <Button
                  variant="outline"
                  className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
                  disabled={busy || !offered}
                  onClick={() => onAct(action)}
                >
                  <span>
                    {game(
                      `narrative.${phase.eventId}.choices.${choice.id}` as never,
                      params as never,
                    )}
                  </span>
                  {preview === undefined || preview.notes.length === 0 ? null : (
                    <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                      {preview.notes.map((note) => render(note)).join(" · ")}
                    </span>
                  )}
                </Button>
                {offered ? <IdleBar action={action} /> : null}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunOverDialog({
  snapshot,
  busy,
  onPlayAgain,
  footer,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onPlayAgain: () => void;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("play");
  const common = useTranslations("common");
  const money = useMoney();

  const reviewing = useReviewing();
  const open = snapshot.phase.kind === "game_over" && !busy && !reviewing;
  const reason = snapshot.phase.kind === "game_over" ? snapshot.phase.reason : null;
  const cause = snapshot.phase.kind === "game_over" ? snapshot.phase.cause : undefined;
  const { stats } = snapshot;
  // What filled the gauge, biggest share first: the answer to "why".
  const breakdown = (Object.keys(stats.qualityBySource) as QualitySource[])
    .map((source) => ({ source, points: stats.qualityBySource[source] }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);
  const counters = [
    ["incidents", stats.incidents],
    ["outages", stats.outages],
    ["rejections", stats.rejections],
    ["staleForced", stats.staleForced],
    ["devsLeft", stats.devsLeft],
    ["moneyLost", stats.moneyLost],
  ] as const;

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("runOver")}</DialogTitle>
          <DialogDescription>
            {reason === "burnout"
              ? t("burnout")
              : reason === "caught"
                ? t("caught")
                : reason === "fired"
                  ? cause === undefined
                    ? t("fired")
                    : t(`firedBy.${cause}` as never)
                  : null}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{common("score")}</dt>
          <dd className="text-right tabular-nums">{snapshot.score}</dd>
          <dt className="text-muted-foreground">{common("commits")}</dt>
          <dd className="text-right tabular-nums">{snapshot.player.totalCommits}</dd>
          <dt className="text-muted-foreground">{common("sprint")}</dt>
          <dd className="text-right tabular-nums">{Math.max(0, snapshot.sprint - 1)}</dd>
          <dt className="text-muted-foreground">{t("ticketsDelivered")}</dt>
          <dd className="text-right tabular-nums">{snapshot.ticketsDelivered}</dd>
          <dt className="text-muted-foreground">{t("moneyEarned")}</dt>
          <dd className="text-right tabular-nums">{money(snapshot.economy.moneyEarned)}</dd>
        </dl>

        {breakdown.length === 0 ? null : (
          <section>
            <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {t("qualityBreakdown")}
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {breakdown.map((entry) => (
                <Fragment key={entry.source}>
                  <dt className="text-muted-foreground">
                    {t(`qualitySource.${entry.source}` as never)}
                  </dt>
                  <dd className="text-right text-branch-hotfix tabular-nums">+{entry.points}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        )}

        {snapshot.economy.history.length < 2 ? null : (
          <FinanceChart history={snapshot.economy.history} />
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-line border-t pt-3 text-muted-foreground text-xs">
          {counters.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{t(`stats.${key}` as never)}</dt>
              <dd className="text-right tabular-nums">
                {key === "moneyLost" ? money(value) : value}
              </dd>
            </Fragment>
          ))}
        </dl>

        <DialogFooter className="sm:justify-between">
          {footer}
          <Button onClick={onPlayAgain}>{t("playAgain")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
