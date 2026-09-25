"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { ActionPanel } from "@/components/hud/ActionPanel";
import { BoardDialog } from "@/components/hud/BoardDialog";
import { CompanyDialog } from "@/components/hud/CompanyDialog";
import {
  ConflictDialog,
  EventDialog,
  RelicDialog,
  RunOverDialog,
} from "@/components/hud/GameDialogs";
import { GaugeFx } from "@/components/hud/GaugeFx";
import { GraphControls } from "@/components/hud/GraphControls";
import { GraphTooltip } from "@/components/hud/GraphTooltip";
import { IdleControls } from "@/components/hud/IdleControls";
import { IdleDriver } from "@/components/hud/IdleDriver";
import { InfoPanel } from "@/components/hud/InfoPanel";
import { useIdleStore } from "@/components/hud/idleStore";
import { LogDrawer } from "@/components/hud/LogDrawer";
import { MatrixRain } from "@/components/hud/MatrixRain";
import { ReducedMotionProvider } from "@/components/hud/motion";
import type { OnAct } from "@/components/hud/origin";
import { ResourceBar } from "@/components/hud/ResourceBar";
import { ReviewDialog } from "@/components/hud/ReviewDialog";
import { SupervisorLine } from "@/components/hud/SupervisorLine";
import { TicketBar } from "@/components/hud/TicketBar";
import { UpgradesDialog } from "@/components/hud/UpgradesDialog";
import { useAusterity } from "@/components/hud/useAusterity";
import { useGameAlerts } from "@/components/hud/useGameAlerts";
import { useUpgradesNews } from "@/components/hud/useUpgradesNews";
import { useAudioSettings } from "@/components/settings/useSettings";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameHandle, MetaProgressDto, RunSaveDto } from "@/game";
import { useGameStore } from "@/game";
import { cn } from "@/lib/utils";

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
    /** What the refs call you beside `HEAD`. */
    playerName?: string;
    /** A saved run's own starting points, for the debugger. */
    startingSkillPoints?: number;
  };
  /** False keeps the idle clock off the stage: the debugger steps by hand. */
  idle?: boolean;
  /** The live handle, for the controls that drive the camera directly. */
  handle: GameHandle | null;
  onReady: (handle: GameHandle | null) => void;
  onAct: OnAct;
  onPlayAgain: () => void;
  runOverFooter?: React.ReactNode;
  /**
   * What to tell the player once WebGL is given up. The debugger has no
   * autosave to promise, so it says less.
   */
  fallbackNote?: string;
}

export function RunStage({
  runKey,
  options,
  handle,
  onReady,
  onAct,
  onPlayAgain,
  runOverFooter,
  fallbackNote,
  idle = true,
}: RunStageProps) {
  const t = useTranslations("play");
  const renderMode = useGameStore((state) => state.renderMode);

  const snapshot = useGameStore((state) => state.snapshot);
  const log = useGameStore((state) => state.log);
  const busy = useGameStore((state) => state.pendingAnimation);
  const [boardOpen, setBoardOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  // Once on, the idle clock stops for nothing the player opens: a dialog
  // left open is not a decision, and the switch is the way to stop it. It
  // only waits for the review's verdict to be read, as it waits for an
  // animation to end.
  const readingReview = useIdleStore((state) => state.readingReview);
  const openShop = useCallback(() => setUpgradesOpen(true), []);
  useGameAlerts(openShop);
  const upgradesNews = useUpgradesNews(snapshot, upgradesOpen);
  useAusterity();
  useAudioSettings();
  const bars = useToastsBelow();

  return (
    <ReducedMotionProvider reduced={options.reducedMotion ?? false}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Flies what the canvas raises, or a dialog gives, to its gauge. */}
        <GaugeFx />
        <div ref={bars} className="contents">
          {snapshot === null ? null : (
            <ResourceBar
              snapshot={snapshot}
              onOpenCompany={() => setCompanyOpen(true)}
              onOpenUpgrades={() => setUpgradesOpen(true)}
              upgradesNews={upgradesNews}
            />
          )}
          {snapshot === null ? null : (
            <TicketBar snapshot={snapshot} onAct={onAct} onOpenBoard={() => setBoardOpen(true)} />
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="order-2 w-full min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-line border-t bg-panel/40 p-4 lg:order-1 lg:w-64 lg:border-t-0 lg:border-r">
            {snapshot === null ? null : <InfoPanel snapshot={snapshot} />}
          </aside>

          <div className="relative order-1 min-h-72 min-w-0 flex-1 bg-bg lg:order-2">
            {/* Behind the graph: the rain the higher tiers bring, fading in by its ramp. */}
            <MatrixRain />
            {/* Above the rain, so its canvas is transparent and the container paints the background. */}
            <div className="relative z-[1] size-full">
              <GameCanvas key={runKey} options={options} onReady={onReady} />
            </div>
            {/* The grid and the scanlines the higher tiers bring, fading in by the variables the look writes. */}
            <div aria-hidden className="austerity-layer" />

            {snapshot === null ? (
              <p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
                {t("loading")}
              </p>
            ) : (
              <>
                {renderMode === "none" ? null : <GraphTooltip />}
                {renderMode === "none" ? null : <GraphControls handle={handle} />}
                <LogDrawer log={log} />
              </>
            )}

            {/* WebGL given up: the graph is drawn by Canvas2D, or not at all. */}
            {renderMode === "webgl" ? null : (
              <p
                role="status"
                className={cn(
                  "absolute inset-x-3 z-10 border border-debt/60 bg-panel/90 px-3 py-2 text-debt text-xs leading-relaxed backdrop-blur-sm",
                  renderMode === "none" ? "top-1/2 -translate-y-1/2 text-center text-sm" : "top-3",
                )}
              >
                {fallbackNote ?? t("webglLost")}
              </p>
            )}
          </div>

          <aside className="order-3 flex w-full min-w-0 shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto border-line border-t bg-panel/40 p-4 lg:w-80 lg:border-t-0 lg:border-l">
            {snapshot === null ? null : (
              <>
                <ActionPanel
                  snapshot={snapshot}
                  onAct={onAct}
                  onOpenBoard={() => setBoardOpen(true)}
                />
                <SupervisorLine snapshot={snapshot} />
                {idle ? <IdleControls /> : null}
                {idle ? <IdleDriver paused={readingReview} onAct={onAct} /> : null}
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
              onAct={onAct}
            />
            <CompanyDialog
              open={companyOpen}
              onOpenChange={setCompanyOpen}
              snapshot={snapshot}
              onAct={onAct}
            />
            <UpgradesDialog
              open={upgradesOpen}
              onOpenChange={setUpgradesOpen}
              snapshot={snapshot}
              onAct={onAct}
            />
            <ReviewDialog snapshot={snapshot} onAct={onAct} />
            <ConflictDialog snapshot={snapshot} busy={busy} onAct={onAct} />
            <RelicDialog snapshot={snapshot} busy={busy} onAct={onAct} />
            <EventDialog snapshot={snapshot} busy={busy} onAct={onAct} />
            <RunOverDialog
              snapshot={snapshot}
              busy={busy}
              onPlayAgain={onPlayAgain}
              {...(runOverFooter === undefined ? {} : { footer: runOverFooter })}
            />
          </>
        )}
      </div>
    </ReducedMotionProvider>
  );
}

/** How far under the bars a toast lands. */
const TOAST_GAP_PX = 8;

/**
 * Keeps the toasts under the run's bars, however tall the bars wrap: their
 * bottom edge, written to `--toast-top` on the root while the run is on
 * screen, and removed with it.
 */
function useToastsBelow(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = ref.current;
    if (wrapper === null) return;
    const root = document.documentElement;
    const place = (): void => {
      let bottom = 0;
      for (const child of wrapper.children) {
        bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
      }
      if (bottom > 0) root.style.setProperty("--toast-top", `${bottom + TOAST_GAP_PX}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    for (const child of wrapper.children) observer.observe(child);
    // A bar that mounts late (the snapshot arrives after the first paint).
    const mutations = new MutationObserver(() => {
      observer.disconnect();
      for (const child of wrapper.children) observer.observe(child);
      place();
    });
    mutations.observe(wrapper, { childList: true });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", place);
      root.style.removeProperty("--toast-top");
    };
  }, []);
  return ref;
}
