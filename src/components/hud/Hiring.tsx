"use client";

import { useTranslations } from "next-intl";

import { Catalog } from "@/components/hud/Catalog";
import { ladderOf } from "@/components/hud/Shop";
import { Badge } from "@/components/ui/badge";
import type { PlayerAction, RunSnapshot } from "@/game";
import { DEV_RANKS } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * Hiring: the ranks there is money and room for, and the sites that make the
 * room, as a catalog of tiles with the picked one in full beside them. The
 * team works on its own once hired; who is there, and what they hold, is
 * read in the company dialog's team tab.
 */
export function Hiring({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const { seats, tier } = snapshot.economy;

  return (
    <Catalog
      snapshot={snapshot}
      onAct={onAct}
      header={
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-muted-foreground text-xs">{t("hireHint")}</p>
          <span className="flex items-center gap-2">
            {snapshot.boosts.freeHire ? <Badge>{t("freeHire")}</Badge> : null}
            <span
              className={cn(
                "text-xs tabular-nums",
                seats.used >= seats.max ? "text-branch-hotfix" : "text-muted-foreground",
              )}
            >
              {t("seats", { used: seats.used, max: seats.max })}
            </span>
          </span>
        </div>
      }
      sections={[
        {
          key: "hire",
          title: t("hire"),
          items: DEV_RANKS.map((rank) => ({ kind: "hire" as const, rank })),
        },
        {
          key: "sites",
          title: t("sites"),
          hint: t("sitesHint"),
          items: ladderOf("org", tier).map((id) => ({ kind: "upgrade" as const, id })),
        },
      ]}
    />
  );
}
