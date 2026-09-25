"use client";

import {
  Activity,
  BatteryCharging,
  Bot,
  ClipboardList,
  Clover,
  FastForward,
  Gauge,
  GitPullRequestArrow,
  GraduationCap,
  Lock,
  type LucideIcon,
  Package,
  Rocket,
  ScanSearch,
  Server,
  Shield,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  branchLinks,
  linkPath,
  spentOn,
  TREE_COLUMNS,
  TREE_LAYOUT,
  treeRows,
} from "@/components/hud/treeLayout";
import { Button } from "@/components/ui/button";
import type { PlayerAction, RunSnapshot } from "@/game";
import { TREE, TREE_BRANCHES, type TreeBranch, type TreeNodeId, treeBranch } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * The skill tree, drawn the way the genre draws talent trees: one panel per
 * branch, each skill an icon tile placed under what it requires, the
 * requirement a line that lights up once met, the rank in the tile's corner.
 * A tile pulses when a point can go there now. Picking one opens its card
 * under the tree — what it does, what it needs, what the next level costs —
 * and the point is placed from there, never by a stray click on the tree.
 * Each branch is as tall as its own rows.
 */

const ICONS: Record<TreeNodeId, LucideIcon> = {
  ci: Workflow,
  cd: Rocket,
  auto_rebase: GitPullRequestArrow,
  review_bot: Bot,
  monitoring: Activity,
  dependabot: Package,
  auto_linter: ScanSearch,
  sre: Server,
  agile_coach: Gauge,
  recruiter: UserPlus,
  growth_hacking: TrendingUp,
  mentoring: GraduationCap,
  product_owner: ClipboardList,
  fast_forward: FastForward,
  stamina: BatteryCharging,
  luck: Clover,
  calm: Shield,
};

/** Each branch's colour: its title, its lit lines, its placed tiles. */
const ACCENTS: Record<TreeBranch, string> = {
  cicd: "var(--color-branch-dev)",
  devops: "var(--color-branch-feature)",
  management: "var(--color-energy)",
  profile: "var(--color-branch-main)",
};

type NodeState = "locked" | "idle" | "ready" | "placed" | "maxed";

interface NodeFacts {
  level: number;
  maxed: boolean;
  locked: boolean;
  offered: boolean;
  state: NodeState;
}

function factsOf(snapshot: RunSnapshot, id: TreeNodeId): NodeFacts {
  const def = TREE[id];
  const level = snapshot.tree[id] ?? 0;
  const maxed = level >= def.maxLevel;
  const locked = (def.requires ?? []).some((req) => (snapshot.tree[req.id] ?? 0) < req.level);
  // The engine offers the action only when it can be placed; the tile says
  // why when it cannot, from the same facts.
  const offered = snapshot.actions.some((a) => a.type === "tree" && a.id === id);
  const state: NodeState = maxed
    ? "maxed"
    : locked
      ? "locked"
      : offered
        ? "ready"
        : level > 0
          ? "placed"
          : "idle";
  return { level, maxed, locked, offered, state };
}

const accentStyle = (branch: TreeBranch): React.CSSProperties =>
  ({ "--tree-accent": ACCENTS[branch] }) as React.CSSProperties;

export function SkillTree({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const [selected, setSelected] = useState<TreeNodeId | null>(null);

  return (
    <div className="@container space-y-3">
      {/* Four in a row or two by two, never three and one: sized on the pane, not the window. */}
      <div className="grid gap-3 @lg:grid-cols-2 @5xl:grid-cols-4">
        {TREE_BRANCHES.map((branch) => (
          <BranchPanel
            key={branch}
            branch={branch}
            snapshot={snapshot}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>
      <NodeCard id={selected} snapshot={snapshot} onAct={onAct} />
    </div>
  );
}

function BranchPanel({
  branch,
  snapshot,
  selected,
  onSelect,
}: {
  branch: TreeBranch;
  snapshot: RunSnapshot;
  selected: TreeNodeId | null;
  onSelect: (id: TreeNodeId) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const ids = treeBranch(branch);
  const spent = ids.reduce((sum, id) => sum + spentOn(id, snapshot.tree[id] ?? 0), 0);
  const links = branchLinks(branch);
  const rows = treeRows([branch]);

  return (
    <section className="tree-branch min-w-0" style={accentStyle(branch)}>
      <header className="tree-branch-header flex items-baseline justify-between gap-2 px-3 py-2">
        <h3 className="hud-title font-medium text-xs uppercase tracking-wider">
          {game(`branches.${branch}.name` as never)}
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("treeSpent", { count: spent })}
        </span>
      </header>
      <div className="px-1 py-2">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${TREE_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, 6.5rem)`,
          }}
        >
          {/* Cell units, stretched to the grid: the strokes keep their width. */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${TREE_COLUMNS} ${rows}`}
            preserveAspectRatio="none"
          >
            {links.map((link) => (
              <path
                key={`${link.from}-${link.to}`}
                d={linkPath(link)}
                className="tree-link"
                data-met={(snapshot.tree[link.from] ?? 0) >= link.level ? "" : undefined}
              />
            ))}
          </svg>
          {links
            .filter((link) => link.level > 1)
            .map((link) => {
              const to = TREE_LAYOUT[link.to];
              return (
                <span
                  key={`${link.from}-${link.to}-level`}
                  className="tree-link-level"
                  data-met={(snapshot.tree[link.from] ?? 0) >= link.level ? "" : undefined}
                  style={{
                    left: `${((to.col + 0.5) / TREE_COLUMNS) * 100}%`,
                    top: `${(to.row / rows) * 100}%`,
                  }}
                >
                  {t("treeLinkLevel", { level: link.level })}
                </span>
              );
            })}
          {ids.map((id) => (
            <NodeTile
              key={id}
              id={id}
              snapshot={snapshot}
              selected={selected === id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function NodeTile({
  id,
  snapshot,
  selected,
  onSelect,
}: {
  id: TreeNodeId;
  snapshot: RunSnapshot;
  selected: boolean;
  onSelect: (id: TreeNodeId) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const def = TREE[id];
  const slot = TREE_LAYOUT[id];
  const facts = factsOf(snapshot, id);
  const Icon = ICONS[id];
  const name = game(`tree.${id}.name` as never);

  return (
    <div
      className="relative z-[1] flex min-w-0 flex-col items-center pt-2"
      style={{ gridColumn: slot.col + 1, gridRow: slot.row + 1 }}
    >
      <button
        type="button"
        className="tree-node"
        data-state={facts.state}
        data-placed={facts.level > 0 ? "" : undefined}
        aria-pressed={selected}
        aria-label={`${name} · ${t("treeLevel", { level: facts.level, max: def.maxLevel })}`}
        onClick={() => onSelect(id)}
      >
        <span aria-hidden className="tree-node-frame" />
        <span aria-hidden className="tree-node-face">
          <Icon className="size-6" />
        </span>
        {facts.locked ? <Lock aria-hidden className="tree-node-lock" /> : null}
        <span aria-hidden className="tree-node-rank tabular-nums">
          {facts.level}/{def.maxLevel}
        </span>
      </button>
      <span className="tree-node-name">{name}</span>
    </div>
  );
}

/** The picked skill, in full, with the one button that spends on it. */
function NodeCard({
  id,
  snapshot,
  onAct,
}: {
  id: TreeNodeId | null;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  // Held at the bottom of the pane: a tile picked low in the tree still shows its card.
  if (id === null) {
    return (
      <p className="tree-card sticky bottom-0 z-10 px-4 py-3 text-muted-foreground text-sm">
        {t("treePick")}
      </p>
    );
  }

  const def = TREE[id];
  const facts = factsOf(snapshot, id);
  const cost = def.cost[facts.level];
  const Icon = ICONS[id];
  const requires = def.requires ?? [];

  return (
    <article
      className="tree-card sticky bottom-0 z-10 flex flex-wrap items-start gap-4 px-4 py-3"
      style={accentStyle(def.branch)}
      aria-live="polite"
    >
      <span
        className="tree-node pointer-events-none shrink-0"
        data-state={facts.state}
        data-placed={facts.level > 0 ? "" : undefined}
      >
        <span aria-hidden className="tree-node-frame" />
        <span aria-hidden className="tree-node-face">
          <Icon className="size-6" />
        </span>
      </span>
      <div className="min-w-48 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h4 className="font-medium">{game(`tree.${id}.name` as never)}</h4>
          <span className="text-muted-foreground text-xs">
            {game(`branches.${def.branch}.name` as never)}
            {" · "}
            <span className="tabular-nums">
              {t("treeLevel", { level: facts.level, max: def.maxLevel })}
            </span>
          </span>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {game(`tree.${id}.desc` as never)}
        </p>
        {requires.length > 0 ? (
          <p
            className={cn("text-xs", facts.locked ? "text-branch-hotfix" : "text-muted-foreground")}
          >
            {t("treeNeeds", {
              nodes: requires
                .map((req) =>
                  t("treeRequires", {
                    node: game(`tree.${req.id}.name` as never),
                    level: req.level,
                  }),
                )
                .join(", "),
            })}
          </p>
        ) : null}
      </div>
      <Button
        className="shrink-0 self-center"
        variant={facts.offered ? "default" : "outline"}
        disabled={!facts.offered}
        onClick={() => onAct({ type: "tree", id })}
      >
        {facts.maxed ? t("treeMaxed") : t("treeBuy", { level: facts.level + 1, points: cost ?? 0 })}
      </Button>
    </article>
  );
}
