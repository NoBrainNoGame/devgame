"use client";

import { useTranslations } from "next-intl";

import { useGameText } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ActionPreview, actionKey, type PlayerAction, type RunSnapshot } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The turn's decisions, each labelled with what it will cost and what it might
 * do. Showing the odds is the single biggest departure from the original
 * design: a hidden roll reads as unfairness, a visible one reads as a gamble.
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

  if (snapshot.phase.kind !== "choose_action" && snapshot.phase.kind !== "choose_node") {
    return null;
  }

  const choosingNode = snapshot.phase.kind === "choose_node";

  const moves = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "move" }> => action.type === "move",
  );
  const commits = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "commit" }> => action.type === "commit",
  );
  const review = snapshot.actions.find((action) => action.type === "review");
  const devops = snapshot.actions.filter(
    (action): action is Extract<PlayerAction, { type: "devops" }> => action.type === "devops",
  );

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("actionsTitle")}
      </h2>

      {choosingNode ? (
        <>
          <p className="text-muted-foreground text-sm">{t("chooseNode")}</p>
          <div className="grid gap-2">
            {moves.map((action) => (
              <MoveButton
                key={actionKey(action)}
                action={action}
                snapshot={snapshot}
                busy={busy}
                onAct={onAct}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="grid gap-2">
        {commits.map((action) => (
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
      </div>

      {devops.length === 0 ? null : (
        <div className="space-y-2 border-line border-t pt-3">
          <p className="text-muted-foreground text-xs">
            {t("devopsPoints", { count: snapshot.devopsPoints })} · {t("devopsHint")}
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

/**
 * A candidate node, offered as a card rather than only as a circle on the
 * canvas. The graph is the map; this is the choice — and a choice you have to
 * hunt for with a mouse is a worse choice.
 */
function MoveButton({
  action,
  snapshot,
  busy,
  onAct,
}: {
  action: Extract<PlayerAction, { type: "move" }>;
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const game = useTranslations("game");
  const node = snapshot.nodes[action.nodeId];
  const preview = snapshot.previews[actionKey(action)];

  if (node === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="h-auto justify-between px-3 py-2 text-left"
          disabled={busy}
          onClick={() => onAct(action)}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>{game(`nodes.${node.kind}.name` as never)}</span>
            {node.skillId === undefined ? (
              <span className="whitespace-normal text-left font-normal text-muted-foreground text-xs">
                {game(`nodes.${node.kind}.desc` as never)}
              </span>
            ) : (
              <span className="font-normal text-branch-feature text-xs">
                {game(`skills.${node.skillId}.name` as never)}
              </span>
            )}
          </span>

          {preview !== undefined && preview.energyCost > 0 ? (
            <span className="shrink-0 text-energy text-xs tabular-nums">
              −{preview.energyCost} ⚡
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>

      <TooltipContent className="max-w-64">
        {game(`nodes.${node.kind}.desc` as never)}
      </TooltipContent>
    </Tooltip>
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
  onAct,
}: {
  label: string;
  hint: string;
  preview: ActionPreview | undefined;
  busy: boolean;
  onAct: () => void;
}) {
  const t = useTranslations("hud");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="h-auto justify-between px-3 py-2 text-left"
          disabled={busy || preview === undefined || preview.blocked !== undefined}
          onClick={onAct}
        >
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>{label}</span>
            <span className="whitespace-normal text-left font-normal text-muted-foreground text-xs">
              {hint}
            </span>
          </span>

          {preview === undefined ? null : (
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs tabular-nums">
              {preview.successPct === undefined ? null : (
                <span className={cn(preview.successPct < 60 && "text-debt")}>
                  {preview.successPct} %
                </span>
              )}
              <span className="text-energy">−{preview.energyCost} ⚡</span>
            </span>
          )}
        </Button>
      </TooltipTrigger>

      {preview === undefined ? null : (
        <TooltipContent className="max-w-64 space-y-1">
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

function PreviewDetail({ preview }: { preview: ActionPreview }) {
  const t = useTranslations("hud");

  return (
    <>
      {preview.successPct === undefined ? null : (
        <p>{t("previewSuccess", { percent: preview.successPct })}</p>
      )}
      <p>{t("previewEnergy", { cost: preview.energyCost })}</p>
      {preview.progress === undefined ? null : (
        <p>{t("previewProgress", { min: preview.progress[0], max: preview.progress[1] })}</p>
      )}
      {preview.debtDelta === undefined ? null : (
        <p>{t("previewDebt", { min: preview.debtDelta[0], max: preview.debtDelta[1] })}</p>
      )}
      <p className="text-muted-foreground">
        {preview.botsAdvance ? t("previewBotsAdvance") : t("previewFreeMove")}
      </p>
    </>
  );
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
