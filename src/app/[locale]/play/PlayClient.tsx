"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { ActionPanel } from "@/components/hud/ActionPanel";
import { BotPanel } from "@/components/hud/BotPanel";
import { CommitLog } from "@/components/hud/CommitLog";
import { ConflictDialog, RelicDialog, RunOverDialog } from "@/components/hud/GameDialogs";
import { ResourceBar } from "@/components/hud/ResourceBar";
import { Skeleton } from "@/components/ui/skeleton";
import { type GameHandle, type MetaProgressDto, type PlayerAction, useGameStore } from "@/game";

/**
 * Owns the run: who is playing it, which seed, and what happens when it ends.
 *
 * The `ssr: false` import has to live in a Client Component — Next 16 refuses
 * it anywhere else — and Pixi would touch `window` during a server render
 * anyway.
 */
const GameCanvas = dynamic(
  () => import("@/components/game/GameCanvas").then((module) => module.GameCanvas),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> },
);

export interface PlayClientProps {
  meta: MetaProgressDto;
  seed: string;
  mode: "classic" | "daily";
  profileId: MetaProgressDto["unlockedProfiles"][number];
}

export function PlayClient(props: PlayClientProps) {
  const t = useTranslations("play");
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const [runKey, setRunKey] = useState(() => crypto.randomUUID());

  const snapshot = useGameStore((state) => state.snapshot);
  const log = useGameStore((state) => state.log);
  const busy = useGameStore((state) => state.pendingAnimation);

  // A new `clientRunId` is what tells the canvas to start over; keeping the
  // object stable otherwise stops an unrelated re-render from restarting it.
  const options = useMemo(
    () => ({
      seed: props.seed,
      mode: props.mode,
      profileId: props.profileId,
      meta: props.meta,
      clientRunId: runKey,
      createdAt: new Date().toISOString(),
    }),
    [props.seed, props.mode, props.profileId, props.meta, runKey],
  );

  const act = useCallback(
    (action: PlayerAction) => {
      handle?.dispatch(action);
    },
    [handle],
  );

  const playAgain = useCallback(() => setRunKey(crypto.randomUUID()), []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {snapshot === null ? null : <ResourceBar snapshot={snapshot} />}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-bg">
          <GameCanvas key={runKey} options={options} onReady={setHandle} />
          {snapshot === null ? (
            <p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              {t("loading")}
            </p>
          ) : null}
        </div>

        <aside className="flex w-80 shrink-0 flex-col gap-5 overflow-hidden border-line border-l bg-panel/40 p-4">
          {snapshot === null ? null : (
            <>
              <ActionPanel snapshot={snapshot} busy={busy} onAct={act} />
              <BotPanel snapshot={snapshot} />
            </>
          )}
          <CommitLog log={log} />
        </aside>
      </div>

      {snapshot === null ? null : (
        <>
          <ConflictDialog snapshot={snapshot} busy={busy} onAct={act} />
          <RelicDialog snapshot={snapshot} busy={busy} onAct={act} />
          <RunOverDialog snapshot={snapshot} onPlayAgain={playAgain} />
        </>
      )}
    </div>
  );
}
