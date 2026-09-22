"use client";

import { useTranslations } from "next-intl";

import { useGameText } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ActionPreview,
  actionKey,
  type PlayerAction,
  type RunSnapshot,
  type TicketView,
} from "@/game";
import { cn } from "@/lib/utils";

/**
 * The turn's decisions, each labelled with what it will cost and what it might
 * do. Showing the odds is the single biggest departure from the original
 * design: a hidden roll reads as unfairness, a visible one reads as a gamble.
 *
 * Two halves. The board — tickets to start, tickets to switch to — costs no
 * turn. The work — commit, review, merge — costs one.
 */
export function ActionPanel({
  snapshot,
  busy,
  onAct,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");

  if (snapshot.phase.kind !== "choose_action") return null;

  const starts = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "start" }> => action.type === "start",
  );
  const checkouts = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "checkout" }> => action.type === "checkout",
  );
  const commits = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "commit" }> => action.type === "commit",
  );
  // Writing this commit plainly, and writing it as the thing it offers.
  const plain = commits.filter((action) => action.kind === undefined);
  const written = commits.filter((action) => action.kind !== undefined);
  const review = snapshot.actions.find((action) => action.type === "review");
  const merge = snapshot.actions.find((action) => action.type === "merge");
  const devops = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "devops" }> => action.type === "devops",
  );

  const current = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("actionsTitle")}
      </h2>

      {current === undefined ? (
        <p className="text-muted-foreground text-sm">{t("noTicket")}</p>
      ) : (
        <TicketHeader ticket={current} />
      )}

      <div className="grid gap-2">
        {current?.mustWrite === undefined ? null : (
          <p className="text-branch-hotfix text-xs">{t(`mustWrite.${current.mustWrite}`)}</p>
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

        {review === undefined ? null : (
          <ActionButton
            label={t("review")}
            hint={t("reviewHint")}
            preview={snapshot.previews[actionKey(review)]}
            busy={busy}
            onAct={() => onAct(review)}
          />
        )}

        {merge === undefined ? null : (
          <ActionButton
            label={t("merge")}
            hint={t("mergeHint")}
            preview={snapshot.previews[actionKey(merge)]}
            busy={busy}
            emphasis
            onAct={() => onAct(merge)}
          />
        )}
      </div>

      {checkouts.length === 0 ? null : (
        <div className="space-y-2 border-line border-t pt-3">
          <p className="text-muted-foreground text-xs">{t("switchTo")}</p>
          <div className="grid gap-2">
            {checkouts.map((action) => {
              const ticket = snapshot.tickets.find((item) => item.id === action.ticketId);
              return ticket === undefined ? null : (
                <TicketButton
                  key={actionKey(action)}
                  ticket={ticket}
                  label={t("checkout")}
                  busy={busy}
                  onAct={() => onAct(action)}
                />
              );
            })}
          </div>
        </div>
      )}

      {starts.length === 0 ? null : (
        <div className="space-y-2 border-line border-t pt-3">
          <p className="text-muted-foreground text-xs">{t("backlog")}</p>
          <div className="grid gap-2">
            {starts.map((action) => {
              const ticket = snapshot.tickets.find((item) => item.id === action.ticketId);
              return ticket === undefined ? null : (
                <TicketButton
                  key={actionKey(action)}
                  ticket={ticket}
                  label={t("startTicket")}
                  busy={busy}
                  onAct={() => onAct(action)}
                />
              );
            })}
          </div>
        </div>
      )}

      {devops.length === 0 ? null : (
        <div className="space-y-2 border-line border-t pt-3">
          <p className="text-muted-foreground text-xs">
            {t("devopsPoints", { count: snapshot.devopsPoints })}
            {" "}· {t("devopsHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {devops.map((action) => (
              <Button
                key={actionKey(action)}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAct(action)}
              >
                <DevopsLabel id={action.id} snapshot={snapshot} />
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** The ticket in hand: what it asks for, and how far along it is. */
function TicketHeader({ ticket }: { ticket: TicketView }) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  return (
    <div className="space-y-1 rounded-md border border-line bg-panel/60 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(ticket.kind === "hotfix" && "text-branch-hotfix")}>
          {game(`tickets.${ticket.kind}.name` as never)}
          {" "}
          <span className="text-muted-foreground">#{ticket.id.slice(1)}</span>
        </span>
        <span className="tabular-nums text-xs">
          {t("ticketPoints", { filled: ticket.filled, max: ticket.points })}
        </span>
      </div>
      <CriteriaList ticket={ticket} />
      {ticket.skillId === undefined ? null : (
        <p className="text-branch-feature text-xs">
          {game(`skills.${ticket.skillId}.name` as never)}
        </p>
      )}
      {ticket.behind > 0 ? (
        <p className="text-debt text-xs">{t("behindDev", { count: ticket.behind })}</p>
      ) : null}
    </div>
  );
}

function CriteriaList({ ticket }: { ticket: TicketView }) {
  const game = useTranslations("game");
  if (ticket.criteria.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {ticket.criteria.map((criterion) => (
        <li
          key={criterion.kind}
          className={cn(criterion.met ? "text-branch-main" : "text-muted-foreground")}
        >
          {criterion.met ? "✓" : "○"} {game(`criteria.${criterion.kind}.name` as never)}
        </li>
      ))}
    </ul>
  );
}

/**
 * A ticket offered as a card: to start, or to switch to. Both are free, so the
 * right-hand figure is what the ticket asks for rather than an energy cost.
 */
function TicketButton({
  ticket,
  label,
  busy,
  onAct,
}: {
  ticket: TicketView;
  label: string;
  busy: boolean;
  onAct: () => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full min-w-0 justify-between px-3 py-2 text-left"
          disabled={busy}
          onClick={onAct}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>
              {label}
              {" "}
              <span className="text-muted-foreground">#{ticket.id.slice(1)}</span>
            </span>
            <span
              className={cn(
                "whitespace-normal text-left font-normal text-xs",
                ticket.skillId === undefined ? "text-muted-foreground" : "text-branch-feature",
              )}
            >
              {ticket.skillId === undefined
                ? game(`tickets.${ticket.kind}.name` as never)
                : game(`skills.${ticket.skillId}.name` as never)}
            </span>
          </span>

          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {t("ticketPoints", { filled: ticket.filled, max: ticket.points })}
          </span>
        </Button>
      </TooltipTrigger>

      <TooltipContent className="max-w-64" side="left">
        {ticket.skillId === undefined ? null : (
          <p className="text-muted-foreground">{game(`skills.${ticket.skillId}.desc` as never)}</p>
        )}
        {ticket.criteria.length === 0 ? (
          <p className="text-muted-foreground">{t("noCriteria")}</p>
        ) : (
          <>
            <p>{t("criteriaTitle")}</p>
            <ul className="text-muted-foreground">
              {ticket.criteria.map((criterion) => (
                <li key={criterion.kind}>
                  {game(`criteria.${criterion.kind}.name` as never)}
                  {" "}— {game(`criteria.${criterion.kind}.desc` as never)}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-muted-foreground">{t("previewFreeMove")}</p>
      </TooltipContent>
    </Tooltip>
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

  return (
    <ActionButton
      label={`${game(`nodes.${action.kind}.name` as never)} · ${
        action.mode === "craft" ? t("byHand") : t("byMachine")
      }`}
      hint={game(`nodes.${action.kind}.desc` as never)}
      preview={snapshot.previews[actionKey(action)]}
      busy={busy}
      // Five detours in two hands is ten cards: the description waits in the
      // tooltip so the list stays readable at a glance.
      compact
      onAct={() => onAct(action)}
    />
  );
}

function DevopsLabel({
  id,
  snapshot,
}: {
  id: Extract<PlayerAction, { type: "devops" }>["id"];
  snapshot: RunSnapshot;
}) {
  const game = useTranslations("game");
  const level = snapshot.devops[id] ?? 0;
  return (
    <span>
      {game(`devops.${id}.name` as never)}
      {level > 0 ? ` ${level + 1}` : ""}
    </span>
  );
}

function ActionButton({
  label,
  hint,
  preview,
  busy,
  emphasis = false,
  compact = false,
  onAct,
}: {
  label: string;
  hint: string;
  preview: ActionPreview | undefined;
  busy: boolean;
  emphasis?: boolean;
  /** Hint in the tooltip only, numbers on one line: for the long lists. */
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
  const energy = <span className={cn(!emphasis && "text-energy")}>−{preview.energyCost} ⚡</span>;
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
