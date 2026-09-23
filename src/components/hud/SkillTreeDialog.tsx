"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot } from "@/game";
import { TREE, TREE_BRANCHES, type TreeNodeId, treeBranch } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * The skill tree: four branches, each a column, each node a card with its
 * level pips and its price. A node that needs another is drawn under it with
 * a connector, so the shape of the branch is the shape of the decision.
 *
 * Placing a point is free in time, so the dialog can stay open while the
 * player spends several; the store republishes after each and the cards
 * update in place.
 */
export function SkillTreeDialog({
  open,
  onOpenChange,
  snapshot,
  busy,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("treeTitle")}</DialogTitle>
          <DialogDescription>
            <span className="text-foreground tabular-nums">
              {t("treePoints", { count: snapshot.skillPoints })}
            </span>
            {" · "}
            {t("treeHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TREE_BRANCHES.map((branch) => (
            <section key={branch} className="min-w-0 space-y-2">
              <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {game(`branches.${branch}.name` as never)}
              </h3>
              <div className="space-y-2">
                {treeBranch(branch).map((id) => (
                  <TreeNodeCard key={id} id={id} snapshot={snapshot} busy={busy} onAct={onAct} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TreeNodeCard({
  id,
  snapshot,
  busy,
  onAct,
}: {
  id: TreeNodeId;
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  const def = TREE[id];
  const level = snapshot.tree[id] ?? 0;
  const maxed = level >= def.maxLevel;
  const action: PlayerAction = { type: "tree", id };
  // The engine offers the action only when it can be placed; the card says
  // why when it cannot, from the same facts.
  const offered = snapshot.actions.some((a) => a.type === "tree" && a.id === id);
  const requires = def.requires ?? [];
  const locked = requires.some((req) => (snapshot.tree[req.id] ?? 0) < req.level);
  const cost = def.cost[level];
  const short = !maxed && !locked && cost !== undefined && cost > snapshot.skillPoints;

  return (
    <div className={cn("relative", requires.length > 0 && "ml-4")}>
      {requires.length > 0 ? (
        <span
          aria-hidden
          className="absolute top-1/2 -left-4 h-px w-3 bg-line before:absolute before:-top-6 before:left-0 before:h-6 before:w-px before:bg-line"
        />
      ) : null}
      <article
        className={cn(
          "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
          maxed && "border-branch-main/60",
          locked && "opacity-60",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{game(`tree.${id}.name` as never)}</span>
          <span
            className="shrink-0 text-branch-main text-xs tracking-widest"
            title={t("treeLevel", { level, max: def.maxLevel })}
          >
            {"●".repeat(level)}
            <span className="text-line">{"○".repeat(def.maxLevel - level)}</span>
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {game(`tree.${id}.desc` as never)}
        </p>
        {requires.length > 0 ? (
          <p className={cn("text-xs", locked ? "text-branch-hotfix" : "text-muted-foreground")}>
            {requires
              .map((req) =>
                t("treeRequires", { node: game(`tree.${req.id}.name` as never), level: req.level }),
              )
              .join(" · ")}
          </p>
        ) : null}
        <Button
          size="sm"
          variant={offered ? "default" : "outline"}
          className={cn("w-full", short && "text-muted-foreground")}
          disabled={busy || !offered}
          onClick={() => onAct(action)}
        >
          {maxed ? t("treeMaxed") : t("treeBuy", { level: level + 1, points: cost ?? 0 })}
        </Button>
      </article>
    </div>
  );
}
