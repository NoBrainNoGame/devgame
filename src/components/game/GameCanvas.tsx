"use client";

import { useEffect, useRef } from "react";

import { austerityOverride } from "@/components/hud/austerityOverride";
import { useGameText } from "@/components/hud/useGameText";
import type { GameHandle, I18nText, MetaProgressDto, RunSaveDto } from "@/game";
import { mountGame } from "@/game";
import { audioService } from "@/game/audio/AudioService";
import { readLocalRun } from "@/lib/storage/sync";
import { modalsOpen } from "@/lib/ui/modals";

/**
 * The canvas, and nothing else.
 *
 * It is loaded through a `next/dynamic` chunk with `ssr: false` because Pixi
 * touches `window` at import time. The effect guards against React 19's
 * double-invoked effects and against `app.init()` resolving after the component
 * has already gone away.
 */
export function GameCanvas({
  options,
  onReady,
}: {
  options: {
    seed: string;
    mode: "classic" | "daily";
    profileId: MetaProgressDto["unlockedProfiles"][number];
    meta: MetaProgressDto;
    clientRunId: string;
    createdAt: string;
    resume?: RunSaveDto;
    reducedMotion?: boolean;
    playerName?: string;
    startingSkillPoints?: number;
  };
  onReady: (handle: GameHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameText = useGameText();

  // A translator is a new function on every render, and remounting the game on
  // a re-render would restart the run. The scene only needs to be able to call
  // it, so it goes through a ref.
  const translateRef = useRef<(text: I18nText) => string>(() => "");
  translateRef.current = gameText;

  // Mounting is a one-time effect: the parent starts a new run by changing this
  // component's React key, which unmounts the old canvas and its runner. Reading
  // the props through refs keeps an unrelated re-render from restarting a run in
  // progress.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let handle: GameHandle | undefined;

    const override = austerityOverride();
    // The props' resume snapshot is what the run was when the player pressed
    // "resume"; a canvas mounted again later — a hot reload, a remount —
    // must pick the run up where the local save has it now, not back then.
    const wanted = optionsRef.current;
    const local = readLocalRun();
    const resume =
      local !== null &&
      local.clientRunId === wanted.clientRunId &&
      local.actions.length > (wanted.resume?.actions.length ?? 0)
        ? local
        : wanted.resume;
    void mountGame(host, {
      ...wanted,
      ...(resume === undefined ? {} : { resume }),
      // The run's page paints the background itself, interpolated with the
      // look, and draws the rain under the graph: the canvas stays clear.
      transparent: true,
      // Any modal over the run holds the canvas's story still.
      paused: () => modalsOpen() > 0,
      translate: (value) => translateRef.current(value),
      ...(override === null ? {} : { austerityOverride: override }),
      audio: audioService(),
    })
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        handle = created;
        onReadyRef.current(created);
      })
      // The picture's own failures are handled inside (`sceneGuard.ts`): only
      // the engine refusing the run lands here, and there is nothing to show.
      .catch((error: unknown) => {
        console.error("The run could not be mounted:", error);
      });

    return () => {
      cancelled = true;
      handle?.dispose();
      onReadyRef.current(null);
    };
  }, []);

  return <div ref={hostRef} className="size-full" />;
}
