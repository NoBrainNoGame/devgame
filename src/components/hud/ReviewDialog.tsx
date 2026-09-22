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
 * Refused, the same dialog asks the one question a rejection leaves: start
 * over, or fix it and carry on.
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
  const review = useGameStore((state) => state.pendingReview);
  const reducedMotion = useGameStore(() => false);
  const [step, setStep] = useState(0);

  const ticketId = review?.ticketId ?? null;

  // Restart the reading for every new review, and let a reduced-motion
  // setting skip straight to the verdict.
  useEffect(() => {
    if (ticketId === null) return;
    setStep(reducedMotion ? 4 : 0);
    if (reducedMotion) return;
    const timers = [1, 2, 3, 4].map((n) => setTimeout(() => setStep(n), n * STEP_MS));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [ticketId, reducedMotion]);

  if (review === null) return null;

  const rejected = snapshot.phase.kind === "ticket_rejected";
  const ticket = snapshot.tickets.find((item) => item.id === review.ticketId);
  const done = step >= 4;

  const dismiss = (): void => {
    gameStore.setState({ pendingReview: null });
  };

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviewTitle", { id: review.ticketId.slice(1) })}</DialogTitle>
        </DialogHeader>

        <ol className="space-y-1.5 font-mono text-xs">
          <Line shown={step >= 1}>{t("reviewReading", { count: ticket?.commits ?? 0 })}</Line>
          <Line shown={step >= 2} tone={review.unread > 0 ? "warn" : "ok"}>
            {review.unread > 0
              ? `${t("reviewUnread", { count: review.unread })} → ${
                  review.bugs > 0 ? t("reviewBugs", { bugs: review.bugs }) : t("reviewNoBugs")
                }`
              : t("reviewAllRead")}
          </Line>
          <Line shown={step >= 3} tone={review.debt > review.maxDebt ? "warn" : "ok"}>
            {t("reviewDebt", { debt: review.debt, max: review.maxDebt })}
          </Line>
          <Line shown={done} tone={review.accepted ? "ok" : "bad"} strong>
            {review.accepted ? t("reviewAccepted") : t("reviewRejected")}
          </Line>
        </ol>

        {!done ? (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setStep(4)}>
              {t("skip")}
            </Button>
          </div>
        ) : review.accepted ? (
          <div className="flex justify-end">
            <Button onClick={dismiss}>{t("reviewMerge")}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {review.rework > 0 ? `${t("reviewRework", { count: review.rework })} ` : ""}
              {t("reviewParallel")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left"
                disabled={!rejected}
                onClick={() => {
                  dismiss();
                  onAct({ type: "restart" });
                }}
              >
                <span>{t("reviewRestart")}</span>
                <span className="font-normal text-muted-foreground text-xs">
                  {t("reviewRestartHint")}
                </span>
              </Button>
              <Button
                className="h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left"
                disabled={!rejected}
                onClick={() => {
                  dismiss();
                  onAct({ type: "resume" });
                }}
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
      {shown ? children : " "}
    </li>
  );
}
