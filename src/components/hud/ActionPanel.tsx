"use client";

import { useTranslations } from "next-intl";

import { displayTier } from "@/components/hud/displayTier";
import { IdleBar } from "@/components/hud/IdleBar";
import { useGameText } from "@/components/hud/useGameText";
import { useTiered } from "@/components/hud/useTiered";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ActionPreview, actionKey, type PlayerAction, type RunSnapshot } from "@/game";
import { signed } from "@/game/core/i18n";
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
 * The idle clock's bar sits under whichever card the clock will press: left
 * alone, the run keeps moving, and the bar says how.
 */
export function ActionPanel({
  snapshot,
  busy,
  onAct,
  onOpenBoard,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
  /** Nothing in hand: the panel's first offer is the board. */
  onOpenBoard: () => void;
}) {
  const t = useTranslations("hud");
  const tiered = useTiered(displayTier(snapshot));

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
  // A full obstacle lands back on its feature: no review in between.
  const land = snapshot.actions.find((action) => action.type === "merge");

  const current = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);
  // Full, and held back by its obstacle alone: no commit is offered on it any
  // more, and the way forward is the obstacle.
  const toObstacle =
    current?.waitingOnObstacle === true
      ? snapshot.actions.find(
          (action): action is Extract<PlayerAction, { type: "checkout" }> =>
            action.type === "checkout" && current.blockedBy.includes(action.ticketId),
        )
      : undefined;
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === "backlog").length;
  const firstStart = snapshot.actions.find((action) => action.type === "start");
  const hack = snapshot.actions.find((action) => action.type === "hack");

  return (
    <section className="space-y-3">
      <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {tiered("actionsTitle")}
      </h2>

      <div className="grid gap-2">
        {hack === undefined || snapshot.hack === null ? null : (
          <ActionButton
            label={t("hack.title")}
            hint={t(`hack.${snapshot.hack}`)}
            preview={snapshot.previews[actionKey(hack)]}
            busy={busy}
            danger
            action={hack}
            onAct={() => onAct(hack)}
          />
        )}

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
            action={submit}
            onAct={() => onAct(submit)}
          />
        )}

        {toObstacle === undefined ? null : (
          <ActionButton
            label={t("switchToObstacle")}
            hint={t("switchToObstacleHint", { id: toObstacle.ticketId.slice(1) })}
            preview={snapshot.previews[actionKey(toObstacle)]}
            busy={busy}
            emphasis
            action={toObstacle}
            onAct={() => onAct(toObstacle)}
          />
        )}

        {land === undefined ? null : (
          <ActionButton
            label={t("landObstacle")}
            hint={t("landObstacleHint")}
            preview={snapshot.previews[actionKey(land)]}
            busy={busy}
            emphasis
            action={land}
            onAct={() => onAct(land)}
          />
        )}

        {plain.map((action) => (
          <ActionButton
            key={actionKey(action)}
            label={action.mode === "craft" ? t("craftCommit") : t("aiCommit")}
            hint={action.mode === "craft" ? t("craftCommitHint") : t("aiCommitHint")}
            preview={snapshot.previews[actionKey(action)]}
            busy={busy}
            action={action}
            onAct={() => onAct(action)}
          />
        ))}

        {review === undefined ? null : (
          <ActionButton
            label={t("review")}
            hint={t("reviewHint")}
            preview={snapshot.previews[actionKey(review)]}
            busy={busy}
            action={review}
            onAct={() => onAct(review)}
          />
        )}

        {current !== undefined ? null : (
          <div className="relative">
            <Button
              className="h-auto w-full min-w-0 justify-between px-3 py-2 text-left"
              disabled={busy}
              onClick={onOpenBoard}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="max-w-full truncate">{t("pickTicket")}</span>
                <span className="whitespace-normal text-left font-normal text-xs opacity-80">
                  {waiting > 0 ? t("pickTicketHint", { count: waiting }) : t("pickTicketEmpty")}
                </span>
              </span>
            </Button>
            {/* Left alone with nothing in hand, the clock starts the oldest ticket itself. */}
            {firstStart === undefined ? null : <IdleBar action={firstStart} />}
          </div>
        )}

        {rest === undefined ? null : (
          <ActionButton
            label={tiered("rest")}
            hint={snapshot.autopilot > 0 ? tiered("restHintAutopilot") : tiered("restHint")}
            preview={snapshot.previews[actionKey(rest)]}
            busy={busy}
            action={rest}
            onAct={() => onAct(rest)}
          />
        )}

        {displayTier(snapshot) < 4 ? null : <ReviewPolicySwitch snapshot={snapshot} />}

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

/**
 * A switch that does nothing. From the fourth tier the panel grows a
 * "human review" toggle, on; once the system has made review optional it
 * greys out and says so. Cosmetic by design: the rule never read it. It is
 * there to be noticed.
 */
function ReviewPolicySwitch({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const optional = snapshot.flags.humanReviewOptional;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5 text-xs">
      <span className={cn(optional && "text-muted-foreground")}>{t("humanReview")}</span>
      <span className="flex items-center gap-2">
        {optional ? <span className="text-muted-foreground">{t("humanReviewPolicy")}</span> : null}
        <Button
          size="xs"
          variant={optional ? "ghost" : "secondary"}
          aria-pressed={!optional}
          disabled={optional}
          className="px-2"
        >
          {optional ? t("switchOff") : t("switchOn")}
        </Button>
      </span>
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

  // Five detours in two hands is ten cards: the machine's card is named as
  // such ("Rebase IA"), the hand's says so under its name, and the
  // description waits in the tooltip.
  return (
    <ActionButton
      label={game(`nodes.${action.kind}.${action.mode === "ai" ? "aiName" : "name"}` as never)}
      {...(action.mode === "craft" ? { subtitle: t("byHand") } : {})}
      hint={game(`nodes.${action.kind}.desc` as never)}
      preview={snapshot.previews[actionKey(action)]}
      busy={busy}
      compact
      action={action}
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
  danger = false,
  action,
  onAct,
}: {
  label: string;
  /** A second, muted line under the label: the hand a detour is written by. */
  subtitle?: string;
  hint: string;
  preview: ActionPreview | undefined;
  busy: boolean;
  emphasis?: boolean;
  /** The one red card: a coin flip with the run on the other side. */
  danger?: boolean;
  /** Hint in the tooltip only, numbers on two short lines: for the long lists. */
  compact?: boolean;
  /** The move this card plays, so the idle clock's bar can find its card. */
  action?: PlayerAction;
  onAct: () => void;
}) {
  const t = useTranslations("hud");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <Button
            variant={danger ? "destructive" : emphasis ? "default" : "outline"}
            className={cn(
              "h-auto w-full min-w-0 justify-between px-3 text-left",
              compact ? "py-1.5" : "py-2",
              danger && "border-branch-hotfix/60",
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
          {action === undefined ? null : <IdleBar action={action} />}
        </div>
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
  const t = useTranslations("hud");
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
      <span className={cn(!emphasis && "text-branch-feature")}>{t("chipPoints", { points })}</span>
    ) : null;
  // Debt costs the code's health: the chip speaks the gauge's language.
  const debt =
    debtMax > 0 ? (
      <span className={cn(!emphasis && "text-debt")}>
        {t("chipHealth", {
          delta: `\u2212${debtMin === debtMax ? debtMax : `${debtMin}\u2013${debtMax}`}`,
        })}
      </span>
    ) : debtMin < 0 ? (
      <span className={cn(!emphasis && "text-branch-main")}>
        {t("chipHealth", { delta: `+${-debtMin}` })}
      </span>
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
        <p>
          {t("previewHealth", {
            min: signed(-preview.debtDelta[1]),
            max: signed(-preview.debtDelta[0]),
          })}
        </p>
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
