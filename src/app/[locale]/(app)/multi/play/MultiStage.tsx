"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OnAct } from "@/components/hud/origin";
import { AutopilotLine } from "@/components/multi/AutopilotLine";
import { ConnectionBanner } from "@/components/multi/connection";
import { errorKey, useRealtimeErrors } from "@/components/multi/errors";
import { MiniRanking } from "@/components/multi/MiniRanking";
import { PendingBar } from "@/components/multi/PendingBar";
import { RoundBar } from "@/components/multi/RoundBar";
import { TeamMates } from "@/components/multi/TeamMates";
import { VoteDialog } from "@/components/multi/VoteDialog";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import type { CompanyOptions, GameHandle } from "@/game";
import { useGameStore } from "@/game";
import type { RunState } from "@/game/core/types";
import type { CompanyStart } from "@/game/dto/company";
import { useRouter } from "@/i18n/navigation";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { EntryDriver } from "@/realtime/client/driver";
import { realtimeClient } from "@/realtime/client/instance";
import { realtimeStore, useRealtime } from "@/realtime/client/store";

import { RunStage } from "../../play/RunStage";

/**
 * A company's run on the stage that solo uses, with the company around it.
 *
 * Nothing is applied here: a button sends the move to the server, and the
 * driver applies every entry the server sends — mine and everybody's — in
 * order. The stage remounts whenever the company is sent again (a join, a
 * resync after a drift). When the player no longer has a seat, or the company
 * is gone, they are carried back to the lobby.
 */
export function MultiStage(): React.JSX.Element | null {
  const t = useTranslations("multi");
  const router = useRouter();
  const join = useRealtime((state) => state.join);
  const mountKey = useRealtime((state) => state.mountKey);
  const lobby = useRealtime((state) => state.lobby);
  const closed = useRealtime((state) => state.closed);
  const me = useRealtime((state) => state.me);
  const meta = useMetaStore((state) => state.meta);
  const hydrate = useMetaStore((state) => state.hydrate);
  const snapshot = useGameStore((state) => state.snapshot);
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const driverRef = useRef<EntryDriver | null>(null);
  useRealtimeErrors();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Applies what arrives, whenever it arrives.
  useEffect(() => realtimeStore.subscribe(() => driverRef.current?.drain()), []);

  // No seat and the lobby already answered: nothing to play here.
  useEffect(() => {
    if (join === null && lobby !== null) router.replace("/multi");
  }, [join, lobby, router]);

  const onReady = useCallback((created: GameHandle | null) => {
    setHandle(created);
    if (created === null) {
      driverRef.current = null;
      return;
    }
    const driver = new EntryDriver({
      store: realtimeStore,
      sink: {
        applyEntry: (row) => created.applyEntry(row.entry),
        hash: () => created.hash(),
        busy: () => created.busy(),
        skip: () => created.skipAnimations(),
      },
      onDesync: (seq, hash) => {
        realtimeClient().resync(seq, hash);
      },
    });
    driverRef.current = driver;
    driver.drain();
  }, []);

  const act = useCallback<OnAct>(
    (action, origin) => {
      if (handle === null) return;
      if (handle.busy()) handle.skipAnimations();
      const result = handle.dispatch(action, origin);
      if (!result.ok) notify.error(t(`errors.${errorKey(result.reason)}` as never));
    },
    [handle, t],
  );

  const leave = useCallback(() => {
    if (window.confirm(t("leaveConfirm"))) realtimeClient().leaveSeat();
  }, [t]);

  const backToLobby = useCallback(() => {
    realtimeStore.getState().dispatch({ type: "left" });
    router.replace("/multi");
  }, [router]);

  const options = useMemo(() => {
    if (join === null) return null;
    const company: CompanyOptions = {
      start: join.start as CompanyStart,
      site: join.site,
      ...(join.snapshot === undefined
        ? {}
        : { snapshot: join.snapshot.state as unknown as RunState }),
      entries: join.entries.map((row) => row.entry),
      send: (action) => realtimeClient().submit(action),
    };
    return {
      seed: join.start.seed,
      mode: "classic" as const,
      profileId: "junior" as const,
      meta,
      clientRunId: join.companyId,
      createdAt: new Date(0).toISOString(),
      reducedMotion: meta.settings.reducedMotion,
      playerName: me?.name ?? "",
      seat: join.seat,
      company,
    };
  }, [join, meta, me?.name]);

  if (options === null) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <RunStage
        runKey={String(mountKey)}
        options={options}
        idle={false}
        handle={handle}
        onReady={onReady}
        onAct={act}
        onPlayAgain={backToLobby}
        slots={{
          underBars: <RoundBar />,
          leftBottom: (
            <>
              <TeamMates />
              <Button size="sm" variant="ghost" onClick={leave}>
                {t("leave")}
              </Button>
            </>
          ),
          rightBottom: (
            <>
              <PendingBar />
              <AutopilotLine />
              <MiniRanking />
            </>
          ),
          overlay: (
            <>
              <ConnectionBanner />
              {closed === "dissolved" || closed === "abandoned" ? (
                <div className="absolute inset-0 z-30 grid place-items-center bg-bg/80 p-4">
                  <div className="max-w-sm space-y-3 border border-line bg-panel p-4 text-center">
                    <p>{t(`over.closed.${closed}`)}</p>
                    <Button onClick={backToLobby}>{t("over.back")}</Button>
                  </div>
                </div>
              ) : null}
            </>
          ),
        }}
        vote={snapshot === null ? undefined : <VoteDialog snapshot={snapshot} />}
      />
    </div>
  );
}
