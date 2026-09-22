"use client";

import { useTranslations } from "next-intl";

import { labelledKind, useGameStore } from "@/game";
import { cn } from "@/lib/utils";

/**
 * What a commit on the graph actually was.
 *
 * The canvas cannot render readable prose at arbitrary zoom, and a Pixi text
 * object is not selectable or translatable by the page. So the graph reports
 * which node is hovered and where it is on screen, and this follows it in the
 * DOM — which also means it reads correctly to a screen reader and in both
 * languages.
 */
export function GraphTooltip(): React.JSX.Element | null {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  const nodeId = useGameStore((state) => state.hoveredNodeId);
  const at = useGameStore((state) => state.hoveredAt);
  const snapshot = useGameStore((state) => state.snapshot);

  if (nodeId === null || at === null || snapshot === null) return null;

  const node = snapshot.nodes[nodeId];
  if (node === undefined) return null;

  const kind = labelledKind(node.kind);
  const mode = node.commit?.mode;
  const unread = node.commit?.mode === "ai" && node.commit.reviewed === false;

  return (
    <div
      role="tooltip"
      // Positioned against the canvas, not the page: the canvas is the
      // containing block, and the offsets the graph reports are canvas-local.
      style={{ left: at.x, top: at.y }}
      className="pointer-events-none absolute z-20 -translate-y-1/2 translate-x-6"
    >
      <div className="w-60 rounded-md border border-line bg-panel/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="font-medium text-sm">{game(`nodes.${kind}.name` as never)}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          {game(`nodes.${kind}.desc` as never)}
        </p>

        <dl className="mt-3 space-y-1 border-line border-t pt-2 text-xs">
          {mode === undefined ? null : (
            <Row label={t("tooltipAuthor")}>
              <span className={cn(mode === "ai" ? "text-ai" : "text-branch-main")}>
                {node.commit?.author !== undefined
                  ? t("tooltipByDev", { dev: node.commit.author })
                  : mode === "ai"
                    ? t("tooltipByMachine")
                    : t("tooltipByHand")}
              </span>
            </Row>
          )}

          {node.commit === undefined ? null : (
            <Row label={t("tooltipReview")}>
              <span className={cn(unread ? "text-debt" : "text-muted-foreground")}>
                {unread ? t("tooltipUnread") : t("tooltipRead")}
              </span>
            </Row>
          )}

          <Row label={t("tooltipBranch")}>
            <span className="text-muted-foreground">
              {node.lane === 0
                ? "main"
                : node.lane === 1 && node.ticketId === undefined
                  ? "dev"
                  : node.ticketId === undefined
                    ? t("tooltipFeature")
                    : `#${node.ticketId.slice(1)}`}
            </span>
          </Row>

          {node.skillId === undefined ? null : (
            <Row label={t("tooltipGrants")}>
              <span className="text-branch-feature">
                {game(`skills.${node.skillId}.name` as never)}
              </span>
            </Row>
          )}
        </dl>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
