"use client";

import { useTranslations } from "next-intl";

import { useGameText } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ActionPreview,
  actionKey,
  labelledKind,
  type PlayerAction,
  type RunSnapshot,
} from "@/game";
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
  // Writing this commit plainly, and writing it as the thing it offers.
  const plain = commits.filter((action) => action.kind === undefined);
  const written = commits.filter((action) => action.kind !== undefined);
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
 * A candidate node, offered as a card. This is the only place a decision is
 * made: the graph is a record of what happened, and it draws nothing above your
 * head, so there is no circle to hunt for with a mouse.
 *
 * The label says what taking the option *does*, not which node kind the engine
 * calls it. Stepping onto a branch is "new branch" — that is the act being
 * chosen — while a node on `main` that a branch happens to leave is just a
 * commit until you stand on it.
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
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const node = snapshot.nodes[action.nodeId];
  const head = snapshot.nodes[snapshot.player.nodeId];
  const preview = snapshot.previews[actionKey(action)];

  if (node === undefined) return null;

  // Every candidate is the first commit of a branch now, so the question is
  // only ever "which feature" — and the answer is named after the feature, not
  // after the kind of node its first commit happens to be.
  const opensBranch = node.branchId !== undefined && node.branchId !== head?.branchId;
  const kind = labelledKind(node.kind);

  const label = opensBranch ? t("openBranch") : game(`nodes.${kind}.name` as never);
  const hint = opensBranch ? t("openBranchHint") : game(`nodes.${kind}.desc` as never);

  // What the branch is actually for. It is carried by the merge node at the far
  // end, so without this the commonest decision in the game is the only one
  // made blind.
  const branch = node.branchId === undefined ? undefined : snapshot.branches[node.branchId];
  const skillId = node.skillId ?? (opensBranch ? branch?.skillId : undefined);

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
            <span>{label}</span>
            {skillId === undefined ? (
              <span className="whitespace-normal text-left font-normal text-muted-foreground text-xs">
                {hint}
              </span>
            ) : (
              <span className="whitespace-normal text-left font-normal text-branch-feature text-xs">
                {game(`skills.${skillId}.name` as never)}
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

      <TooltipContent className="max-w-64" side="left">
        {skillId === undefined ? null : (
          <p className="text-muted-foreground">{game(`skills.${skillId}.desc` as never)}</p>
        )}
        {preview === undefined ? null : <PreviewDetail preview={preview} />}
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
      label={`${game(`nodes.${action.kind}.name` as never)} · ${
        action.mode === "craft" ? t("byHand") : t("byMachine")
      }`}
      hint={game(`nodes.${action.kind}.desc` as never)}
      preview={snapshot.previews[actionKey(action)]}
      busy={busy}
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
        <TooltipContent className="max-w-64" side="left">
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
