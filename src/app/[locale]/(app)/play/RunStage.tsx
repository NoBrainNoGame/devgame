"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { ActionPanel } from "@/components/hud/ActionPanel";
import { CommitLog } from "@/components/hud/CommitLog";
import { ConflictDialog, RelicDialog, RunOverDialog } from "@/components/hud/GameDialogs";
import { GraphControls } from "@/components/hud/GraphControls";
import { GraphTooltip } from "@/components/hud/GraphTooltip";
import { ResourceBar } from "@/components/hud/ResourceBar";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameHandle, MetaProgressDto, PlayerAction, RunSaveDto } from "@/game";
import { useGameStore } from "@/game";

/**
 * A run in progress: the canvas, the HUD around it, and the dialogs the game
 * opens when it needs an answer.
 *
 * The `ssr: false` import has to live in a Client Component — Next 16 refuses
 * it anywhere else — and Pixi would touch `window` during a server render
 * anyway.
 */
const GameCanvas = dynamic(
  () => import("@/components/game/GameCanvas").then((module) => module.GameCanvas),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-none" /> },
);

export interface RunStageProps {
  runKey: string;
  options: {
    seed: string;
    mode: "classic" | "daily";
    profileId: MetaProgressDto["unlockedProfiles"][number];
    meta: MetaProgressDto;
    clientRunId: string;
    createdAt: string;
    resume?: RunSaveDto;
    reducedMotion?: boolean;
  };
  /** The live handle, for the controls that drive the camera directly. */
  handle: GameHandle | null;
  onReady: (handle: GameHandle | null) => void;
  onAct: (action: PlayerAction) => void;
  onPlayAgain: () => void;
  runOverFooter?: React.ReactNode;
}

export function RunStage({
  runKey,
  options,
  handle,
  onReady,
  onAct,
  onPlayAgain,
  runOverFooter,
}: RunStageProps) {
  const t = useTranslations("play");

  const snapshot = useGameStore((state) => state.snapshot);
  const log = useGameStore((state) => state.log);
  const busy = useGameStore((state) => state.pendingAnimation);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {snapshot === null ? null : <ResourceBar snapshot={snapshot} />}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-72 min-w-0 flex-1 bg-bg">
          <GameCanvas key={runKey} options={options} onReady={onReady} />

          {snapshot === null ? (
            <p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              {t("loading")}
            </p>
          ) : (
            <>
              <GraphTooltip />
              <GraphControls handle={handle} />
            </>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-hidden border-line border-t bg-panel/40 p-4 lg:w-80 lg:border-t-0 lg:border-l">
          {snapshot === null ? null : <ActionPanel snapshot={snapshot} busy={busy} onAct={onAct} />}
          <CommitLog log={log} />
        </aside>
      </div>

      {snapshot === null ? null : (
        <>
          <ConflictDialog snapshot={snapshot} busy={busy} onAct={onAct} />
          <RelicDialog snapshot={snapshot} busy={busy} onAct={onAct} />
          <RunOverDialog
            snapshot={snapshot}
            busy={busy}
            onPlayAgain={onPlayAgain}
            {...(runOverFooter === undefined ? {} : { footer: runOverFooter })}
          />
        </>
      )}
    </div>
  );
}
