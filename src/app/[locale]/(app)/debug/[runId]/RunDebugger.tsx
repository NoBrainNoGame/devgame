"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { GameHandle, PlayerAction, RunSaveDto } from "@/game";
import { emptyMeta, gameStore, useGameStore } from "@/game";

import { RunStage } from "../../play/RunStage";

/**
 * The stage, with a clock you turn by hand.
 *
 * The log is the run: the engine is pure, so the state after `k` actions is
 * the same however it is reached. Stepping forward dispatches the next
 * action on the live session, animations and all; stepping anywhere else
 * remounts the stage on the log cut at that point, which replays in an
 * instant. Acting from the stage itself is allowed — that is how a
 * hypothesis is tried — and rewrites the rest of the log in this view only:
 * nothing here is ever saved.
 */
export function RunDebugger({
  save,
  owner,
  status,
  savedAt,
}: {
  save: RunSaveDto;
  owner: string;
  status: string;
  savedAt: string;
}): React.JSX.Element {
  const t = useTranslations("debug");
  const [actions, setActions] = useState<PlayerAction[]>(save.actions);
  const [cursor, setCursor] = useState(save.actions.length);
  // Bumped when the stage has to be rebuilt on a shorter or longer log.
  const [generation, setGeneration] = useState(0);
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const snapshot = useGameStore((state) => state.snapshot);

  const meta = useMemo(() => {
    const base = emptyMeta(save.createdAt);
    return {
      ...base,
      unlockedSkills: [...save.unlockedSkills],
      settings: { ...base.settings, sound: false, playerName: owner },
    };
  }, [save.createdAt, save.unlockedSkills, owner]);

  const jump = useCallback((to: number) => {
    setCursor(to);
    setGeneration((value) => value + 1);
  }, []);

  // A remount replays the log up to the cursor; a log the rules no longer
  // accept stops short, and the cursor follows what actually replayed.
  const onReady = useCallback((created: GameHandle | null) => {
    setHandle(created);
    if (created === null) return;
    const replayed = created.getActions().length;
    setCursor((wanted) => {
      if (replayed < wanted) {
        setStoppedAt(replayed);
        return replayed;
      }
      return wanted;
    });
  }, []);

  const forward = useCallback(() => {
    const next = actions[cursor];
    if (handle === null || next === undefined) return;
    // As in a run (`PlayClient.act`): a step cuts the story short rather than
    // wait for it — and a dialog on screen holds the story still for good.
    if (gameStore.getState().pendingAnimation) handle.skipAnimations();
    const result = handle.dispatch(next);
    if (!result.ok) {
      setStoppedAt(cursor);
      return;
    }
    setCursor(cursor + 1);
  }, [actions, cursor, handle]);

  // Acting from the stage: the rest of the log is rewritten from here.
  const onAct = useCallback(
    (action: PlayerAction) => {
      if (handle === null) return;
      if (gameStore.getState().pendingAnimation) handle.skipAnimations();
      const result = handle.dispatch(action);
      if (!result.ok) return;
      setActions((log) => [...log.slice(0, cursor), action]);
      setCursor(cursor + 1);
      setStoppedAt(null);
    },
    [handle, cursor],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "ArrowRight") forward();
      if (event.key === "ArrowLeft" && cursor > 0) jump(cursor - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forward, jump, cursor]);

  const last = actions[cursor - 1];
  const next = actions[cursor];
  const atEnd = cursor >= actions.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-cyber/25 border-b bg-panel/60 px-3 py-2 text-xs">
        <span className="font-display font-semibold text-cyber uppercase tracking-[0.12em]">
          {t("title")}
        </span>
        <span className="text-muted-foreground">
          {owner} · {save.seed} · {save.mode} · {t(`status.${status}` as never)} ·{" "}
          {savedAt.slice(0, 16).replace("T", " ")}
        </span>

        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={cursor === 0}
            onClick={() => jump(0)}
            aria-label={t("first")}
          >
            <ChevronFirst />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={cursor === 0}
            onClick={() => jump(cursor - 1)}
            aria-label={t("previous")}
          >
            <ChevronLeft />
          </Button>
          <input
            type="range"
            min={0}
            max={actions.length}
            value={cursor}
            onChange={(event) => jump(Number(event.target.value))}
            className="w-40 accent-cyber"
            aria-label={t("step", { step: cursor, total: actions.length })}
          />
          <Button
            size="icon-sm"
            variant="outline"
            disabled={atEnd || handle === null}
            onClick={forward}
            aria-label={t("next")}
          >
            <ChevronRight />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={atEnd}
            onClick={() => jump(actions.length)}
            aria-label={t("last")}
          >
            <ChevronLast />
          </Button>
          <span className="ml-1 font-mono tabular-nums">
            {t("step", { step: cursor, total: actions.length })}
          </span>
        </div>

        {snapshot === null ? null : (
          <span className="font-mono text-muted-foreground tabular-nums">
            {t("where", {
              turn: snapshot.turn,
              sprint: snapshot.sprint,
              phase: snapshot.phase.kind,
            })}
          </span>
        )}

        <span className="min-w-0 basis-full font-mono text-muted-foreground text-xs sm:basis-auto">
          {last === undefined ? null : (
            <>
              <span className="text-foreground">{t("lastAction")}</span> {JSON.stringify(last)}
            </>
          )}
          {next === undefined ? null : (
            <>
              {" · "}
              <span className="text-foreground">{t("nextAction")}</span> {JSON.stringify(next)}
            </>
          )}
        </span>

        {stoppedAt === null ? null : (
          <span className="basis-full text-cyber-hot">{t("stopped", { step: stoppedAt })}</span>
        )}
      </div>

      <RunStage
        fallbackNote={t("webglLost")}
        runKey={`debug-${generation}`}
        handle={handle}
        idle={false}
        options={{
          seed: save.seed,
          mode: save.mode,
          profileId: save.profileId,
          meta,
          clientRunId: save.clientRunId,
          createdAt: save.createdAt,
          resume: { ...save, actions: actions.slice(0, cursor) },
          startingSkillPoints: save.startingSkillPoints,
          reducedMotion: false,
          playerName: owner,
        }}
        onReady={onReady}
        onAct={onAct}
        onPlayAgain={() => jump(0)}
      />
    </div>
  );
}
