"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { setIdleSettings } from "@/components/hud/idleStore";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import type { GameHandle, MetaProgressDto, PlayerAction, RunMode, RunSaveDto } from "@/game";
import { gameStore, useGameStore } from "@/game";
import { Link } from "@/i18n/navigation";
import { applyRunToMeta } from "@/lib/profile/progression";
import { submitRun } from "@/lib/run/actions";
import {
  clearLocalRun,
  clearPendingSubmit,
  pickLongerRun,
  pushRun,
  readLocalRun,
  readPendingSubmit,
  syncProgress,
  writeLocalRun,
  writePendingSubmit,
} from "@/lib/storage/sync";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { CHECKPOINT_EVERY_SPRINTS } from "@/lib/telemetry/schema";
import { sendRunSample } from "@/lib/telemetry/send";

import { RunSetup } from "./RunSetup";
import { RunStage } from "./RunStage";

/**
 * Everything around a run that is not the run itself: which one is being
 * played, where it is saved, and what it leaves behind.
 *
 * Offline-first. A signed-out player gets the whole game against
 * `localStorage`; signing in adds a mirror and a place on the board, and takes
 * nothing away.
 */

const LOCAL_SAVE_DEBOUNCE_MS = 500;
const CLOUD_SAVE_INTERVAL_MS = 10_000;

export interface PlayClientProps {
  /** Whether this instance has a server side at all: offline, there is nothing to sign in to. */
  online: boolean;
  signedIn: boolean;
  /** The account's name, when signed in: what the run calls you. */
  userName: string | null;
  /** Progress already on the server, if any. Merged with the local copy. */
  serverMeta: MetaProgressDto | null;
  /** Today's shared seed. Absent when the database is unreachable. */
  dailySeed: string | null;
  /** A run the server had in progress, to compare against the local one. */
  serverRun: RunSaveDto | null;
}

type Stage =
  | { kind: "setup" }
  | {
      kind: "running";
      runKey: string;
      seed: string;
      mode: RunMode;
      profileId: MetaProgressDto["unlockedProfiles"][number];
      clientRunId: string;
      createdAt: string;
      resume?: RunSaveDto;
    };

export function PlayClient(props: PlayClientProps) {
  const t = useTranslations("play");
  const errors = useTranslations("errors");

  const meta = useMetaStore((state) => state.meta);
  const hydrated = useMetaStore((state) => state.hydrated);
  const setMeta = useMetaStore((state) => state.setMeta);
  const setSyncState = useMetaStore((state) => state.setSyncState);
  const hydrate = useMetaStore((state) => state.hydrate);

  const [stage, setStage] = useState<Stage>({ kind: "setup" });
  const [resumable, setResumable] = useState<RunSaveDto | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleRef = useRef<GameHandle | null>(null);
  /** When this tab started on the current run, for the sample's session time. */
  const startedAtRef = useRef(Date.now());
  const checkpointRef = useRef<string | null>(null);
  const locale = useLocale();
  // Mirrored into state as well as a ref: the camera controls are a component
  // and need a render when the handle arrives.
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const awardedRef = useRef<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Merge the two copies of progress once, on arrival. Everything after that
  // is written locally first and pushed when a run ends.
  //
  // The local copy is read from the store rather than taken from the render, so
  // this does not re-run on every write it causes.
  useEffect(() => {
    if (!hydrated || !props.signedIn) return;

    let cancelled = false;
    setSyncState("syncing");

    void syncProgress(useMetaStore.getState().meta).then((outcome) => {
      if (cancelled) return;
      setMeta(outcome.meta);
      setSyncState(outcome.state);
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, props.signedIn, setMeta, setSyncState]);

  useEffect(() => {
    if (!hydrated) return;
    setResumable(pickLongerRun(readLocalRun(), props.serverRun));
  }, [hydrated, props.serverRun]);

  const start = useCallback(
    (choice: {
      profileId: MetaProgressDto["unlockedProfiles"][number];
      mode: RunMode;
      playerName: string;
    }) => {
      // The name is a setting: it survives the run and follows the account.
      const current = useMetaStore.getState().meta;
      if (choice.playerName !== current.settings.playerName) {
        setMeta({
          ...current,
          settings: { ...current.settings, playerName: choice.playerName },
          updatedAt: new Date().toISOString(),
        });
      }
      const seed =
        choice.mode === "daily" && props.dailySeed !== null
          ? props.dailySeed
          : crypto.randomUUID().replaceAll("-", "").slice(0, 16);

      // A run left behind is worth knowing about: where players stop.
      const left = readLocalRun();
      if (props.online && left !== null && left.actions.length > 0) {
        sendRunSample(left, "abandoned", locale, Date.now() - startedAtRef.current);
      }
      clearLocalRun();
      setSubmitted(false);
      awardedRef.current = null;
      startedAtRef.current = Date.now();
      // Every run starts in the player's hands; the clock is theirs to turn on.
      setIdleSettings({ enabled: false });

      setStage({
        kind: "running",
        runKey: crypto.randomUUID(),
        seed,
        mode: choice.mode,
        profileId: choice.profileId,
        clientRunId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    },
    [props.dailySeed, props.online, locale, setMeta],
  );

  const resume = useCallback(() => {
    if (resumable === null) return;

    setSubmitted(false);
    awardedRef.current = null;
    startedAtRef.current = Date.now();

    setStage({
      kind: "running",
      runKey: crypto.randomUUID(),
      seed: resumable.seed,
      mode: resumable.mode,
      profileId: resumable.profileId,
      clientRunId: resumable.clientRunId,
      createdAt: resumable.createdAt,
      resume: resumable,
    });
  }, [resumable]);

  const act = useCallback((action: PlayerAction) => {
    const handle = handleRef.current;
    if (handle === null) return;
    // A decision taken while the canvas still tells the last turn — the
    // review can be answered before its beat on the canvas ends — cuts the
    // story short instead of being dropped. A dropped answer left the review
    // dialog up, its reading gone, with nothing done.
    if (gameStore.getState().pendingAnimation) handle.skipAnimations();
    handle.dispatch(action);
  }, []);

  const onReady = useCallback((created: GameHandle | null) => {
    handleRef.current = created;
    setHandle(created);
  }, []);

  // --- persistence -------------------------------------------------------
  useEffect(() => {
    if (stage.kind !== "running") return;

    let localTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCloudPush = 0;

    const unsubscribe = gameStore.subscribe((state, previous) => {
      if (state.snapshot === previous.snapshot) return;

      clearTimeout(localTimer);
      localTimer = setTimeout(() => {
        const save = handleRef.current?.save();
        if (save === undefined) return;

        writeLocalRun(save);

        // Every few sprints, a checkpoint for the balancing table: where a
        // run that never ends has got to.
        const sprint = state.snapshot?.sprint ?? 0;
        if (
          props.online &&
          sprint > 0 &&
          sprint % CHECKPOINT_EVERY_SPRINTS === 0 &&
          checkpointRef.current !== `${save.clientRunId}:${sprint}` &&
          state.status !== "game_over"
        ) {
          checkpointRef.current = `${save.clientRunId}:${sprint}`;
          sendRunSample(save, "checkpoint", locale, Date.now() - startedAtRef.current);
        }

        // The cloud copy is a convenience, not the record: throttled hard, and
        // silent when it fails.
        const now = Date.now();
        if (props.signedIn && now - lastCloudPush > CLOUD_SAVE_INTERVAL_MS) {
          lastCloudPush = now;
          void pushRun(save);
        }
      }, LOCAL_SAVE_DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(localTimer);
      unsubscribe();
    };
  }, [stage.kind, props.signedIn, props.online, locale]);

  // --- the end of a run --------------------------------------------------
  const status = useGameStore((state) => state.status);

  useEffect(() => {
    const unsubscribe = gameStore.subscribe((state) => {
      if (state.status !== "game_over" || state.snapshot === null) return;

      const save = handleRef.current?.save();
      if (save === undefined || awardedRef.current === save.clientRunId) return;
      awardedRef.current = save.clientRunId;

      const snapshot = state.snapshot;
      const reward = applyRunToMeta(
        useMetaStore.getState().meta,
        {
          xp: snapshot.xpEarned,
          commits: snapshot.player.totalCommits,
          ticketsDelivered: snapshot.ticketsDelivered,
          sprints: Math.max(0, snapshot.sprint - 1),
        },
        new Date().toISOString(),
      );

      setMeta(reward.meta);
      clearLocalRun();
      if (props.online) sendRunSample(save, "final", locale, Date.now() - startedAtRef.current);

      if (reward.levelsGained > 0) notify.success(t("levelUp", { level: reward.meta.level }));
      for (const id of reward.unlocked) notify.success(t("unlocked", { name: id }));

      // Held so the offer to submit survives a trip through sign-in.
      if (!props.signedIn) writePendingSubmit(save);
    });

    return unsubscribe;
  }, [props.signedIn, props.online, setMeta, t, locale]);

  const submit = useCallback(async () => {
    const save = handleRef.current?.save() ?? readPendingSubmit();
    if (save === undefined || save === null) return;

    const result = await submitRun(save);
    if (result.ok) {
      setSubmitted(true);
      clearPendingSubmit();
      notify.success(t("submitted"));
      return;
    }

    notify.error(errors(result.error.code as never));
  }, [errors, t]);

  if (!hydrated) {
    return <p className="p-8 text-muted-foreground text-sm">{t("loading")}</p>;
  }

  if (stage.kind === "setup") {
    return (
      <RunSetup
        meta={meta}
        dailyAvailable={props.dailySeed !== null}
        resumable={resumable !== null}
        signedIn={props.signedIn}
        onStart={start}
        onResume={resume}
      />
    );
  }

  return (
    <RunStage
      runKey={stage.runKey}
      handle={handle}
      options={{
        seed: stage.seed,
        mode: stage.mode,
        profileId: stage.profileId,
        meta,
        clientRunId: stage.clientRunId,
        createdAt: stage.createdAt,
        ...(stage.resume === undefined ? {} : { resume: stage.resume }),
        reducedMotion: meta.settings.reducedMotion,
        playerName: props.userName ?? meta.settings.playerName,
      }}
      onReady={onReady}
      onAct={act}
      onPlayAgain={() => setStage({ kind: "setup" })}
      runOverFooter={
        status === "game_over" ? (
          <SubmitFooter
            online={props.online}
            signedIn={props.signedIn}
            submitted={submitted}
            onSubmit={submit}
          />
        ) : null
      }
    />
  );
}

function SubmitFooter({
  online,
  signedIn,
  submitted,
  onSubmit,
}: {
  online: boolean;
  signedIn: boolean;
  submitted: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations("play");

  // Offline the score stays in the browser, and a sign-in button would lead
  // to a page this instance does not have.
  if (!online) return null;

  if (!signedIn) {
    return (
      <>
        <p className="text-muted-foreground text-xs sm:mr-auto sm:self-center">
          {t("signInToSubmitHint")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/login">{t("signInToSubmit")}</Link>
        </Button>
      </>
    );
  }

  return (
    <Button variant="outline" disabled={submitted} onClick={onSubmit}>
      {submitted ? t("submitted") : t("submitScore")}
    </Button>
  );
}
