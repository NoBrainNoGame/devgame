"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot } from "@/game";
import { gameStore, useGameStore } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The pull request being read.
 *
 * The verdict is already decided — the engine rolled it when the ticket was
 * submitted — but a verdict that lands instantly reads as arbitrary. So the
 * dialog reads the ticket out loud first: the commits, what nobody reviewed,
 * the debt, then the answer. The canvas holds still meanwhile; the storyboard
 * gives it the same beat this animation takes.
 *
 * Accepted, the merge waits for the button: it is the player's move, costs
 * the turn, and is what the canvas animates next. Refused, the same dialog
 * asks the one question a rejection leaves: start over, or fix it and carry
 * on. A run reloaded in either phase gets the verdict without the reading —
 * the event that carried the details is gone, the decision is not.
 */

const STEP_MS = 650;

export function ReviewDialog({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const pending = useGameStore((state) => state.pendingReview);
  const reducedMotion = useGameStore(() => false);
  const [step, setStep] = useState(0);

  const phase = snapshot.phase;
  const verdict =
    pending !== null
      ? { ticketId: pending.ticketId, accepted: pending.accepted, bugs: pending.bugs }
      : phase.kind === "pr_accepted"
        ? { ticketId: phase.ticketId, accepted: true, bugs: 0 }
        : phase.kind === "ticket_rejected"
          ? { ticketId: phase.ticketId, accepted: false, bugs: phase.bugs }
          : null;
  const ticketId = verdict?.ticketId ?? null;
  const reading = pending !== null && !reducedMotion;

  // Restart the reading for every new review, and let a reduced-motion
  // setting — or a reload with nothing to read — skip straight to the verdict.
  useEffect(() => {
    if (ticketId === null) return;
    setStep(reading ? 0 : 4);
    if (!reading) return;
    const timers = [1, 2, 3, 4].map((n) => setTimeout(() => setStep(n), n * STEP_MS));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [ticketId, reading]);

  if (verdict === null) return null;

  const decided = phase.kind === "pr_accepted" || phase.kind === "ticket_rejected";
  const ticket = snapshot.tickets.find((item) => item.id === verdict.ticketId);
  const done = step >= 4;

  const answer = (action: PlayerAction): void => {
    gameStore.setState({ pendingReview: null });
    onAct(action);
  };

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviewTitle", { id: verdict.ticketId.slice(1) })}</DialogTitle>
        </DialogHeader>

        <ol className="space-y-1.5 font-mono text-xs">
          {pending === null ? null : (
            <>
              <Line shown={step >= 1}>{t("reviewReading", { count: ticket?.commits ?? 0 })}</Line>
              <Line shown={step >= 2} tone={pending.unread > 0 ? "warn" : "ok"}>
                {pending.unread > 0
                  ? `${t("reviewUnread", { count: pending.unread })} → ${
                      pending.bugs > 0 ? t("reviewBugs", { bugs: pending.bugs }) : t("reviewNoBugs")
                    }`
                  : t("reviewAllRead")}
              </Line>
              <Line shown={step >= 3} tone={pending.debt > pending.maxDebt ? "warn" : "ok"}>
                {t("reviewDebt", { debt: pending.debt, max: pending.maxDebt })}
              </Line>
            </>
          )}
          <Line shown={done} tone={verdict.accepted ? "ok" : "bad"} strong>
            {verdict.accepted ? t("reviewAccepted") : t("reviewRejected")}
          </Line>
        </ol>

        {!done ? (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setStep(4)}>
              {t("skip")}
            </Button>
          </div>
        ) : verdict.accepted ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">{t("reviewMergeHint")}</p>
            <Button disabled={!decided} onClick={() => answer({ type: "merge" })}>
              {t("reviewMerge")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {verdict.bugs > 0 ? `${t("reviewBugsToFix", { count: verdict.bugs })} ` : ""}
              {t("reviewParallel")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left"
                disabled={!decided}
                onClick={() => answer({ type: "restart" })}
              >
                <span>{t("reviewRestart")}</span>
                <span className="font-normal text-muted-foreground text-xs">
                  {t("reviewRestartHint")}
                </span>
              </Button>
              <Button
                className="h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left"
                disabled={!decided}
                onClick={() => answer({ type: "resume" })}
              >
                <span>{t("reviewResume")}</span>
                <span className="font-normal text-xs opacity-80">{t("reviewResumeHint")}</span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({
  shown,
  tone = "muted",
  strong = false,
  children,
}: {
  shown: boolean;
  tone?: "muted" | "ok" | "warn" | "bad";
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "transition-opacity duration-300",
        shown ? "opacity-100" : "opacity-0",
        tone === "ok" && "text-branch-main",
        tone === "warn" && "text-debt",
        tone === "bad" && "text-branch-hotfix",
        tone === "muted" && "text-muted-foreground",
        strong && "pt-1 font-sans text-sm",
      )}
    >
      {shown ? children : " "}
    </li>
  );
}
