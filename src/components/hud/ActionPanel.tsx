"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useGameText } from "@/components/hud/useGameText";
import { IDLE_SPEEDS, useIdleSettings } from "@/components/hud/useIdleSettings";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ActionPreview,
  actionKey,
  chooseAutopilot,
  type PlayerAction,
  type RunSnapshot,
} from "@/game";
import { cn } from "@/lib/utils";

/**
 * The turn's decision, each option labelled with what it will cost and what it
 * might do. Showing the odds is the single biggest departure from the original
 * design: a hidden roll reads as unfairness, a visible one reads as a gamble.
 *
 * Only what costs a turn lives here: commit, review, submit. Starting and
 * switching tickets are free and sit with the board and the ticket bar; the
 * shop and the tree have their own screens.
 *
 * The rest button carries the idle clock: left alone, the run keeps moving.
 */
export function ActionPanel({
  snapshot,
  busy,
  paused,
  onAct,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  /** A dialog has the floor: the idle clock waits. */
  paused: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");

  if (snapshot.phase.kind !== "choose_action") return null;

  const commits = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "commit" }> => action.type === "commit",
  );
  // Writing this commit plainly, and writing it as the thing it offers.
  const plain = commits.filter((action) => action.kind === undefined);
  const written = commits.filter((action) => action.kind !== undefined);
  const review = snapshot.actions.find((action) => action.type === "review");
  const rest = snapshot.actions.find((action) => action.type === "rest");
  const submit = snapshot.actions.find((action) => action.type === "submit");

  const current = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("actionsTitle")}
      </h2>

      {current === undefined ? (
        <p className="text-muted-foreground text-sm">{t("noTicket")}</p>
      ) : null}

      <div className="grid gap-2">
        {current?.mustWrite === undefined ? null : (
          <p className="text-branch-hotfix text-xs">{t(`mustWrite.${current.mustWrite}`)}</p>
        )}

        {submit === undefined ? null : (
          <ActionButton
            label={t("submit")}
            hint={t("submitHint")}
            preview={snapshot.previews[actionKey(submit)]}
            busy={busy}
            emphasis
            onAct={() => onAct(submit)}
          />
        )}

        {plain.map((action) => (
          <ActionButton
            key={actionKey(action)}
            label={action.mode === "craft" ? t("craftCommit") : t("aiCommit")}
            hint={action.mode === "craft" ? t("craftCommitHint") : t("aiCommitHint")}
            preview={snapshot.previews[actionKey(action)]}
            busy={busy}
            onAct={() => onAct(action)}
          />
        ))}

        {review === undefined ? null : (
          <ActionButton
            label={t("review")}
            hint={t("reviewHint")}
            preview={snapshot.previews[actionKey(review)]}
            busy={busy}
            onAct={() => onAct(review)}
          />
        )}

        {rest === undefined ? null : (
          <IdleRest snapshot={snapshot} rest={rest} busy={busy} paused={paused} onAct={onAct} />
        )}

        {written.length === 0 ? null : (
          <>
            <p className="pt-1 text-muted-foreground text-xs">{t("writeInstead")}</p>
            {written.map((action) => (
              <WrittenAsButton
                key={actionKey(action)}
                action={action}
                snapshot={snapshot}
                busy={busy}
                onAct={onAct}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/** Seconds the idle clock takes to press rest on its own, at normal speed. Rendering, not rules. */
const IDLE_SECONDS = 30;
const IDLE_TICK_MS = 250;

/**
 * The rest button with the idle clock under it, and the clock's controls.
 *
 * Every turn the clock starts again; when it runs out, the run plays on
 * without you — a rest, or the supervisor's move once it is bought. It waits
 * while the canvas animates or a dialog is open, and it starts over whenever
 * you act yourself, so the bar is always "time since your last decision".
 * Switched off, nothing plays for you; sped up, the same clock runs two, five
 * or ten times faster for a player who trusts their build.
 */
function IdleRest({
  snapshot,
  rest,
  busy,
  paused,
  onAct,
}: {
  snapshot: RunSnapshot;
  rest: PlayerAction;
  busy: boolean;
  paused: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const [idle, setIdle] = useIdleSettings();
  const [clock, setClock] = useState({ turn: snapshot.turn, elapsed: 0 });
  const running = idle.enabled && !busy && !paused;
  const seconds = IDLE_SECONDS / idle.speed;

  // A new turn is a new clock: the state is adjusted during render, the way
  // React asks for a value that resets when a prop changes.
  if (clock.turn !== snapshot.turn) setClock({ turn: snapshot.turn, elapsed: 0 });

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setClock((value) => ({ ...value, elapsed: value.elapsed + IDLE_TICK_MS / 1000 })),
      IDLE_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [running]);

  const due = clock.elapsed >= seconds;
  useEffect(() => {
    if (!due || !running) return;
    setClock((value) => ({ ...value, elapsed: 0 }));
    const move = snapshot.autopilot ? chooseAutopilot(snapshot) : undefined;
    onAct(move ?? rest);
  }, [due, running, snapshot, rest, onAct]);

  const pct = idle.enabled ? Math.min(100, (clock.elapsed / seconds) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <ActionButton
          label={t("rest")}
          hint={snapshot.autopilot ? t("restHintAutopilot") : t("restHint")}
          preview={snapshot.previews[actionKey(rest)]}
          busy={busy}
          onAct={() => onAct(rest)}
        />
        {idle.enabled ? (
          <div
            className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full bg-line"
            aria-hidden
          >
            <div
              className={cn(
                "h-full transition-[width] duration-200 ease-linear",
                snapshot.autopilot ? "bg-branch-feature" : "bg-energy",
                !running && "opacity-40",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              variant={idle.enabled ? "secondary" : "outline"}
              aria-pressed={idle.enabled}
              onClick={() => setIdle({ enabled: !idle.enabled })}
            >
              {idle.enabled ? <Pause /> : <Play />}
              {t("idleAuto")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-64">
            {idle.enabled ? t("idleOnHint", { seconds }) : t("idleOffHint")}
          </TooltipContent>
        </Tooltip>
        <fieldset className="ml-auto flex gap-0.5 border-0 p-0" aria-label={t("idleSpeed")}>
          {IDLE_SPEEDS.map((speed) => (
            <Button
              key={speed}
              size="xs"
              variant={idle.speed === speed ? "secondary" : "ghost"}
              aria-pressed={idle.speed === speed}
              disabled={!idle.enabled}
              className="px-1.5 tabular-nums"
              onClick={() => setIdle({ speed })}
            >
              ×{speed}
            </Button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

/**
 * Writing this commit as a refactor, a squash, a rebase.
 *
 * It is not a fork and never was: the choice is *how to write this commit*, so
 * it sits with the other two ways of writing it and costs the same turn.
 */
function WrittenAsButton({
  action,
  snapshot,
  busy,
  onAct,
}: {
  action: Extract<PlayerAction, { type: "commit" }>;
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  if (action.kind === undefined) return null;

  // Five detours in two hands is ten cards: the name on one line, the hand on
  // the next, and the description waits in the tooltip.
  return (
    <ActionButton
      label={game(`nodes.${action.kind}.name` as never)}
      subtitle={action.mode === "craft" ? t("byHand") : t("byMachine")}
      hint={game(`nodes.${action.kind}.desc` as never)}
      preview={snapshot.previews[actionKey(action)]}
      busy={busy}
      compact
      onAct={() => onAct(action)}
    />
  );
}

function ActionButton({
  label,
  subtitle,
  hint,
  preview,
  busy,
  emphasis = false,
  compact = false,
  onAct,
}: {
  label: string;
  /** A second, muted line under the label: the hand a detour is written by. */
  subtitle?: string;
  hint: string;
  preview: ActionPreview | undefined;
  busy: boolean;
  emphasis?: boolean;
  /** Hint in the tooltip only, numbers on two short lines: for the long lists. */
  compact?: boolean;
  onAct: () => void;
}) {
  const t = useTranslations("hud");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={emphasis ? "default" : "outline"}
          className={cn(
            "h-auto w-full min-w-0 justify-between px-3 text-left",
            compact ? "py-1.5" : "py-2",
          )}
          disabled={busy || preview === undefined || preview.blocked !== undefined}
          onClick={onAct}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="max-w-full truncate">{label}</span>
            {subtitle === undefined ? null : (
              <span className="font-normal text-muted-foreground text-xs">{subtitle}</span>
            )}
            {compact ? null : (
              <span
                className={cn(
                  "whitespace-normal text-left font-normal text-xs",
                  emphasis ? "opacity-80" : "text-muted-foreground",
                )}
              >
                {hint}
              </span>
            )}
          </span>

          {preview === undefined ? null : (
            <PreviewFace preview={preview} emphasis={emphasis} compact={compact} />
          )}
        </Button>
      </TooltipTrigger>

      {preview === undefined ? null : (
        <TooltipContent className="max-w-64" side="left">
          {compact ? <p className="text-muted-foreground">{hint}</p> : null}
          <PreviewDetail preview={preview} />
          {preview.notes.length === 0 ? null : (
            <>
              <p className="pt-1 text-muted-foreground">{t("previewNotes")}</p>
              <NoteList preview={preview} />
            </>
          )}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/**
 * The numbers on the face of a card: the odds, the energy, the points, the
 * debt. Everything the action costs or gives is here, because a price you
 * have to hover to read is a price you did not agree to.
 */
function PreviewFace({
  preview,
  emphasis,
  compact,
}: {
  preview: ActionPreview;
  emphasis: boolean;
  compact: boolean;
}) {
  const debtMin = preview.debtDelta?.[0] ?? 0;
  const debtMax = preview.debtDelta?.[1] ?? 0;
  const points = preview.points?.[1] ?? 0;

  const odds =
    preview.successPct === undefined ? null : (
      <span className={cn(preview.successPct < 60 && !emphasis && "text-debt")}>
        {preview.successPct} %
      </span>
    );
  // "−0" is correct arithmetic and reads as a typo: a free commit says 0.
  const energy = (
    <span className={cn(!emphasis && "text-energy")}>
      {preview.energyCost > 0 ? `−${preview.energyCost}` : "0"} ⚡
    </span>
  );
  const gained =
    points > 0 ? (
      <span className={cn(!emphasis && "text-branch-feature")}>+{points} pts</span>
    ) : null;
  const debt =
    debtMax > 0 ? (
      <span className={cn(!emphasis && "text-debt")}>
        +{debtMin === debtMax ? debtMax : `${debtMin}–${debtMax}`} dette
      </span>
    ) : debtMin < 0 ? (
      <span className={cn(!emphasis && "text-branch-main")}>{debtMin} dette</span>
    ) : null;

  // Compact cards get two lines: the roll and its price, then what it does.
  if (compact) {
    return (
      <span
        className={cn(
          "flex shrink-0 flex-col items-end text-xs tabular-nums leading-tight",
          emphasis && "opacity-90",
        )}
      >
        <span className="flex gap-x-2">
          {odds}
          {energy}
        </span>
        {gained === null && debt === null ? null : (
          <span className="flex gap-x-2">
            {gained}
            {debt}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-end gap-0.5 text-xs tabular-nums",
        emphasis && "opacity-90",
      )}
    >
      {odds}
      {energy}
      {gained}
      {debt}
    </span>
  );
}

function PreviewDetail({ preview }: { preview: ActionPreview }) {
  const t = useTranslations("hud");

  return (
    <>
      {preview.successPct === undefined ? null : (
        <p>{t("previewSuccess", { percent: preview.successPct })}</p>
      )}
      <p>{t("previewEnergy", { cost: preview.energyCost })}</p>
      {preview.points === undefined ? null : (
        <p>{t("previewPoints", { min: preview.points[0], max: preview.points[1] })}</p>
      )}
      {preview.debtDelta === undefined ? null : (
        <p>{t("previewDebt", { min: preview.debtDelta[0], max: preview.debtDelta[1] })}</p>
      )}
      {preview.blocked === undefined ? null : (
        <p className="text-debt">
          <BlockedText preview={preview} />
        </p>
      )}
      <p className="text-muted-foreground">
        {preview.consumesTurn ? t("previewTakesTurn") : t("previewFreeMove")}
      </p>
    </>
  );
}

function BlockedText({ preview }: { preview: ActionPreview }) {
  const gameText = useGameText();
  return preview.blocked === undefined ? null : gameText(preview.blocked);
}

function NoteList({ preview }: { preview: ActionPreview }) {
  const gameText = useGameText();

  return (
    <ul className="text-muted-foreground">
      {preview.notes.map((note) => (
        <li key={note.key}>{gameText(note)}</li>
      ))}
    </ul>
  );
}
