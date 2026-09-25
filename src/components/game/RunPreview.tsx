"use client";

import { useEffect, useRef } from "react";

import { GraphTooltip } from "@/components/hud/GraphTooltip";
import { useGameText } from "@/components/hud/useGameText";
import type { GameHandle, I18nText, MetaProgressDto, RunSaveDto } from "@/game";
import { mountGame } from "@/game";

/**
 * A saved run, drawn and not played: the same scene as the run's, rebuilt
 * from the save, with nothing to click, no numbers popping and no column of
 * commit subjects. It publishes the run to the store like any mount, so the
 * page beside it reads the figures from there — the engine's, never a copy
 * kept in the save.
 *
 * Like `GameCanvas`, it is loaded through a `next/dynamic` chunk with
 * `ssr: false`: Pixi touches `window` at import.
 */
export function RunPreview({
  save,
  meta,
  playerName,
}: {
  save: RunSaveDto;
  meta: MetaProgressDto;
  playerName: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameText = useGameText();
  const translateRef = useRef<(text: I18nText) => string>(() => "");
  translateRef.current = gameText;
  // The account can be written while the preview is up — a sync landing —
  // and redrawing the run for it would replay it for nothing.
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const nameRef = useRef(playerName);
  nameRef.current = playerName;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let handle: GameHandle | undefined;

    mountGame(host, {
      seed: save.seed,
      mode: save.mode,
      profileId: save.profileId,
      meta: metaRef.current,
      clientRunId: save.clientRunId,
      createdAt: save.createdAt,
      resume: save,
      translate: (value) => translateRef.current(value),
      interactive: false,
      claimsGlobal: false,
      // The subjects would run off a box this narrow; hovering a commit still says what it was.
      showSubjects: false,
      showPops: false,
      playerName: nameRef.current,
      transparent: true,
    })
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        handle = created;
        created.camera.frame();
      })
      .catch((error: unknown) => {
        // The figures beside it come from the session, which is built first:
        // a picture that fails leaves them standing.
        console.error("The saved run could not be drawn:", error);
      });

    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [save]);

  return (
    <div className="relative size-full">
      <div ref={hostRef} className="size-full" />
      <GraphTooltip />
    </div>
  );
}
