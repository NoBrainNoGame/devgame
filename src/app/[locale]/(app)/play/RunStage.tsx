"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { ActionPanel } from "@/components/hud/ActionPanel";
import { BoardDialog } from "@/components/hud/BoardDialog";
import { CompanyDialog } from "@/components/hud/CompanyDialog";
import { ConflictDialog, RelicDialog, RunOverDialog } from "@/components/hud/GameDialogs";
import { GraphControls } from "@/components/hud/GraphControls";
import { GraphTooltip } from "@/components/hud/GraphTooltip";
import { IdleControls } from "@/components/hud/IdleControls";
import { IdleDriver } from "@/components/hud/IdleDriver";
import { InfoPanel } from "@/components/hud/InfoPanel";
import { useIdleStore } from "@/components/hud/idleStore";
import { LogDrawer } from "@/components/hud/LogDrawer";
import { ResourceBar } from "@/components/hud/ResourceBar";
import { ReviewDialog } from "@/components/hud/ReviewDialog";
import { SkillTreeDialog } from "@/components/hud/SkillTreeDialog";
import { SupervisorLine } from "@/components/hud/SupervisorLine";
import { TicketBar } from "@/components/hud/TicketBar";
import { useGameAlerts } from "@/components/hud/useGameAlerts";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameHandle, MetaProgressDto, PlayerAction, RunSaveDto } from "@/game";
import { idleTarget, useGameStore } from "@/game";

/**
 * A run in progress: the canvas, the HUD around it, and the dialogs the game
 * opens when it needs an answer.
 *
 * Five places, five jobs. The resource bar says how you are doing, the ticket
 * bar says what you are holding, the panel on the left is the ticket in hand
 * and what the run has become, the panel on the right is the turn's decision,
 * and the log under the graph is memory. The board — starting a ticket — is
 * a dialog, because it is a project decision rather than a move.
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
  const [boardOpen, setBoardOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  // The idle clock waits while a dialog you opened has the floor, and while
  // the review is still being read. The board is the exception when the
  // clock's own move is to start a ticket: that board is the clock's, and the
  // bar sits on the card it will press.
  const readingReview = useIdleStore((state) => state.readingReview);
  const target = snapshot === null ? undefined : idleTarget(snapshot);
  const openShop = useCallback(() => setCompanyOpen(true), []);
  useGameAlerts(openShop);
  const dialogOpen =
    companyOpen || treeOpen || readingReview || (boardOpen && target?.type !== "start");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {snapshot === null ? null : (
        <ResourceBar
          snapshot={snapshot}
          onOpenCompany={() => setCompanyOpen(true)}
          onOpenTree={() => setTreeOpen(true)}
        />
      )}
      {snapshot === null ? null : (
        <TicketBar
          snapshot={snapshot}
          busy={busy}
          onAct={onAct}
          onOpenBoard={() => setBoardOpen(true)}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 w-full min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-line border-t bg-panel/40 p-4 lg:order-1 lg:w-64 lg:border-t-0 lg:border-r">
          {snapshot === null ? null : <InfoPanel snapshot={snapshot} />}
        </aside>

        <div className="relative order-1 min-h-72 min-w-0 flex-1 bg-bg lg:order-2">
          <GameCanvas key={runKey} options={options} onReady={onReady} />

          {snapshot === null ? (
            <p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              {t("loading")}
            </p>
          ) : (
            <>
              <GraphTooltip />
              <GraphControls handle={handle} />
              <LogDrawer log={log} />
            </>
          )}
        </div>

        <aside className="order-3 flex w-full min-w-0 shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto border-line border-t bg-panel/40 p-4 lg:w-80 lg:border-t-0 lg:border-l">
          {snapshot === null ? null : (
            <>
              <ActionPanel
                snapshot={snapshot}
                busy={busy}
                onAct={onAct}
                onOpenBoard={() => setBoardOpen(true)}
              />
              <SupervisorLine snapshot={snapshot} />
              <IdleControls />
              <IdleDriver paused={dialogOpen} onAct={onAct} />
            </>
          )}
        </aside>
      </div>

      {snapshot === null ? null : (
        <>
          <BoardDialog
            open={boardOpen}
            onOpenChange={setBoardOpen}
            snapshot={snapshot}
            busy={busy}
            onAct={onAct}
          />
          <CompanyDialog
            open={companyOpen}
            onOpenChange={setCompanyOpen}
            snapshot={snapshot}
            busy={busy}
            onAct={onAct}
          />
          <SkillTreeDialog
            open={treeOpen}
            onOpenChange={setTreeOpen}
            snapshot={snapshot}
            busy={busy}
            onAct={onAct}
          />
          <ReviewDialog snapshot={snapshot} onAct={onAct} />
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
