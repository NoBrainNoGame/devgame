"use client";

import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/components/settings/useSettings";
import { Button } from "@/components/ui/button";
import type { RunSnapshot } from "@/game";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { useRealtime } from "@/realtime/client/store";

import { type Lesson, nextLesson, type TutorialWhere } from "./lessons";

/** How often to look whether a dialog covers the page, and where the lit element is. */
const POLL_MS = 400;
/** The settings' list is bounded; the oldest ids go first. */
const MAX_DONE = 64;

/**
 * The tutorial's bubble: the lesson that applies now, a step at a time, with
 * the HUD element it is about lit up. Never over a dialog — a modal makes the
 * rest of the page inert, and the lesson waits for it to close — and never in
 * the way: the bubble does not stop the game, the company's clock included.
 *
 * Every step offers the next one, skipping this lesson, and skipping the
 * whole tutorial. Taken or skipped, a lesson is never taught again; both are
 * kept in the settings, so they follow the account across devices.
 */
export function TutorialCoach({
  where,
  multi,
  snapshot,
  upgradesNews = false,
}: {
  where: TutorialWhere;
  multi: boolean;
  snapshot: RunSnapshot | null;
  upgradesNews?: boolean;
}): React.JSX.Element | null {
  const t = useTranslations("tutorial");
  const hydrated = useMetaStore((state) => state.hydrated);
  const hydrate = useMetaStore((state) => state.hydrate);
  const { settings, update } = useSettings();
  const { done, off } = settings.tutorial;
  const roundMine = useRealtime((state) => state.round?.mine ?? null);
  const misses = useRealtime((state) =>
    snapshot?.crew === undefined ? 0 : (state.resolved?.misses[String(snapshot.crew.mySeat)] ?? 0),
  );
  const covered = useDialogOpen();
  const [active, setActive] = useState<{ lesson: Lesson; step: number } | null>(null);
  // The turn the last lesson closed on: the others wait a little after it.
  const lastTurn = useRef<number | null>(null);

  const round = multi && snapshot?.crew !== undefined ? { mine: roundMine !== null, misses } : null;
  const context = { where, multi, snapshot, round, upgradesNews };
  const candidate =
    !hydrated || off || active !== null || covered
      ? null
      : nextLesson(context, new Set(done), lastTurn.current);

  const finish = useCallback(
    (id: string, skipAll: boolean): void => {
      lastTurn.current = snapshot?.turn ?? null;
      setActive(null);
      const kept = done.includes(id) ? done : [...done, id].slice(-MAX_DONE);
      update({ tutorial: { done: kept, off: off || skipAll } });
    },
    [done, off, snapshot?.turn, update],
  );

  // The player did what the lesson asked (started the ticket, rested, opened
  // the PR): it has been learnt by doing, and stays on screen no longer.
  const outgrown =
    active?.lesson.applies !== undefined &&
    snapshot !== null &&
    snapshot.phase.kind === "choose_action" &&
    !active.lesson.applies(snapshot, context);
  const outgrownId = outgrown ? active?.lesson.id : undefined;
  useEffect(() => {
    if (outgrownId !== undefined) finish(outgrownId, false);
  }, [outgrownId, finish]);

  // The lobby reads no profile of its own; what was learnt is in it.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (candidate !== null) setActive({ lesson: candidate, step: 0 });
  }, [candidate]);

  // A question on screen (review, conflict, vote) is no time for a lesson.
  const between = where === "lobby" || snapshot?.phase.kind === "choose_action";
  const shown = active !== null && !off && !covered && between && !outgrown;
  useHighlight(shown ? active.lesson.anchor : undefined);

  if (!shown) return null;
  const { lesson, step } = active;

  const close = (skipAll: boolean): void => finish(lesson.id, skipAll);
  const last = step + 1 >= lesson.steps;
  const key = `lessons.${lesson.id}.s${step + 1}`;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="tutorial-title"
      className="cyber-flicker-in fixed inset-x-4 bottom-4 z-40 space-y-3 border border-cyber/60 bg-panel p-4 shadow-lg sm:inset-x-auto sm:left-4 sm:w-96"
    >
      <header className="flex items-start gap-2">
        <GraduationCap className="mt-0.5 size-4 shrink-0 text-cyber" aria-hidden />
        <h2 id="tutorial-title" className="min-w-0 flex-1 font-medium text-cyber text-sm">
          {t(`${key}.title` as never)}
        </h2>
        {lesson.steps > 1 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("step", { step: step + 1, total: lesson.steps })}
          </span>
        ) : null}
      </header>
      <p className="text-muted-foreground text-sm leading-relaxed">{t(`${key}.body` as never)}</p>
      <footer className="flex flex-wrap items-center justify-end gap-2">
        <Button size="xs" variant="ghost" className="mr-auto" onClick={() => close(true)}>
          {t("skipAll")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => close(false)}>
          {t("skipLesson")}
        </Button>
        <Button
          size="xs"
          onClick={() => (last ? close(false) : setActive({ lesson, step: step + 1 }))}
        >
          {last ? t("done") : t("next")}
        </Button>
      </footer>
    </section>
  );
}

/**
 * Whether a Radix dialog is open. It makes everything outside itself inert and
 * closes when clicked outside, so a bubble drawn over it could not be used.
 */
function useDialogOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const look = (): void =>
      setOpen(
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        ) !== null,
      );
    look();
    const timer = window.setInterval(look, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
  return open;
}

/**
 * Lights up the element a lesson is about, and follows it: the HUD may draw it
 * a moment later, or draw another in its place.
 */
function useHighlight(anchor: string | undefined): void {
  useEffect(() => {
    if (anchor === undefined) return;
    let lit: Element | null = null;
    const follow = (): void => {
      const target = document.querySelector(`[data-tutorial~="${anchor}"]`);
      if (target === lit) return;
      lit?.classList.remove("tutorial-target");
      target?.classList.add("tutorial-target");
      lit = target;
    };
    follow();
    const timer = window.setInterval(follow, POLL_MS);
    return () => {
      window.clearInterval(timer);
      lit?.classList.remove("tutorial-target");
    };
  }, [anchor]);
}
