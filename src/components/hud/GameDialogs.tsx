"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot } from "@/game";

/**
 * The two moments the game stops and asks a direct question: how to untangle a
 * merge conflict, and which improvement to take into the next sprint. Both are
 * modal because both are the only thing that can happen next.
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
  const open = snapshot.phase.kind === "resolve_conflict";

  const manual = snapshot.previews["conflict:manual"];

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("conflictTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
            disabled={busy}
            onClick={() => onAct({ type: "resolve_conflict", how: "manual" })}
          >
            <span>
              {t("conflictManual")}
              {manual?.successPct === undefined ? "" : ` — ${manual.successPct} %`}
            </span>
            <span className="font-normal text-muted-foreground text-xs">
              {t("conflictManualHint")}
            </span>
          </Button>

          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
            disabled={busy}
            onClick={() => onAct({ type: "resolve_conflict", how: "ai" })}
          >
            <span>{t("conflictAi")}</span>
            <span className="font-normal text-muted-foreground text-xs">{t("conflictAiHint")}</span>
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

  const open = snapshot.phase.kind === "choose_relic";
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
            <Button
              key={relicId}
              variant="outline"
              className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
              disabled={busy}
              onClick={() => onAct({ type: "choose_relic", relicId })}
            >
              <span>{game(`relics.${relicId}.name` as never)}</span>
              <span className="font-normal text-muted-foreground text-xs">
                {game(`relics.${relicId}.desc` as never)}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunOverDialog({
  snapshot,
  onPlayAgain,
  footer,
}: {
  snapshot: RunSnapshot;
  onPlayAgain: () => void;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("play");
  const common = useTranslations("common");

  const open = snapshot.phase.kind === "game_over";
  const reason = snapshot.phase.kind === "game_over" ? snapshot.phase.reason : null;

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("runOver")}</DialogTitle>
          <DialogDescription>
            {reason === "burnout" ? t("burnout") : reason === "fired" ? t("fired") : null}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{common("score")}</dt>
          <dd className="text-right tabular-nums">{snapshot.score}</dd>
          <dt className="text-muted-foreground">{common("commits")}</dt>
          <dd className="text-right tabular-nums">{snapshot.player.totalCommits}</dd>
          <dt className="text-muted-foreground">{common("sprint")}</dt>
          <dd className="text-right tabular-nums">{Math.max(0, snapshot.sprint - 1)}</dd>
        </dl>

        <DialogFooter className="sm:justify-between">
          {footer}
          <Button onClick={onPlayAgain}>{t("playAgain")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
