"use client";

import { useTranslations } from "next-intl";

import { useGameText } from "@/components/hud/useGameText";
import { useCountdown } from "@/components/multi/useCountdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot } from "@/game";
import { actionKey, useGameStore } from "@/game";
import { NARRATIVE_EVENTS, RELICS } from "@/game/content";
import { cn } from "@/lib/utils";
import { realtimeClient } from "@/realtime/client/instance";
import { useRealtime } from "@/realtime/client/store";

/**
 * The company's question — the sprint bonus, an event — put to everyone at
 * once. It is the solo dialog's content with a vote under each answer: how
 * many chose it, which is mine, and the clock that settles it. The answer that
 * wins is applied for the company; what each choice does is shown beforehand.
 */
export function VoteDialog({ snapshot }: { snapshot: RunSnapshot }): React.JSX.Element | null {
  const question = useRealtime((state) => state.question);
  const busy = useGameStore((state) => state.pendingAnimation);
  const seconds = useCountdown(question?.deadline ?? null);
  const t = useTranslations("multi.vote");
  const hud = useTranslations("hud");
  const game = useTranslations("game");
  const render = useGameText();

  if (question === null) return null;
  const open = question.result === null && !busy;
  const phase = snapshot.companyPhase;

  const count = (choice: string): number => question.votes[choice] ?? 0;
  const vote = (choice: string): void => {
    realtimeClient().vote(choice);
  };

  const eventParams =
    phase.kind === "event"
      ? {
          competitor:
            phase.competitorId === undefined
              ? ""
              : game(`competitors.${phase.competitorId}.name` as never),
          dev: snapshot.devs.find((dev) => dev.id === phase.devId)?.name ?? "",
        }
      : null;

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {question.kind === "relic"
              ? t("relicTitle")
              : phase.kind === "event"
                ? game(`narrative.${phase.eventId}.title` as never, eventParams as never)
                : t("eventTitle")}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {question.kind === "relic"
              ? t("relicSubtitle")
              : phase.kind === "event"
                ? game(`narrative.${phase.eventId}.text` as never, eventParams as never)
                : t("eventSubtitle")}
          </DialogDescription>
          <p className="text-muted-foreground text-xs">
            {t("remaining", { seconds: seconds ?? 0 })} · {t("noVote")}
          </p>
        </DialogHeader>

        <div className="grid gap-2">
          {question.options.map((choice) => {
            const mine = question.myVote === choice;
            const notes = noteOf(snapshot, phase, choice, render);
            return (
              <Button
                key={choice}
                variant="outline"
                className={cn(
                  "h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left",
                  mine && "[--cyber-stroke:var(--color-foreground)]",
                )}
                onClick={() => vote(choice)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span>
                    {question.kind === "relic"
                      ? game(`relics.${choice}.name` as never)
                      : phase.kind === "event"
                        ? game(
                            `narrative.${phase.eventId}.choices.${choice}` as never,
                            eventParams as never,
                          )
                        : choice}
                  </span>
                  <span className="flex items-center gap-2">
                    {question.kind === "relic" ? (
                      <Badge
                        variant={
                          RELICS[choice as keyof typeof RELICS]?.kind === "keep"
                            ? "default"
                            : "outline"
                        }
                      >
                        {hud(
                          RELICS[choice as keyof typeof RELICS]?.kind === "keep"
                            ? "relicKeep"
                            : "relicBoost",
                        )}
                      </Badge>
                    ) : null}
                    <Badge variant={mine ? "default" : "secondary"}>
                      {t("votes", { count: count(choice) })}
                      {mine ? ` · ${t("yours")}` : ""}
                    </Badge>
                  </span>
                </span>
                {question.kind === "relic" ? (
                  <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                    {game(`relics.${choice}.desc` as never)}
                  </span>
                ) : notes === null ? null : (
                  <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                    {notes}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What an event answer does, from the previews the lead seat's snapshot carries. */
function noteOf(
  snapshot: RunSnapshot,
  phase: RunSnapshot["companyPhase"],
  choice: string,
  render: (text: Parameters<ReturnType<typeof useGameText>>[0]) => string,
): string | null {
  if (phase.kind !== "event" || !(phase.eventId in NARRATIVE_EVENTS)) return null;
  const action: PlayerAction = { type: "answer", eventId: phase.eventId, choice };
  const preview = snapshot.previews[actionKey(action)];
  if (preview === undefined || preview.notes.length === 0) return null;
  return preview.notes.map((note) => render(note)).join(" · ");
}
