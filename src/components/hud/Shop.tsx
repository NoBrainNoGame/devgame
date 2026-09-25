"use client";

import { useTranslations } from "next-intl";

import { Catalog, type CatalogSection } from "@/components/hud/Catalog";
import { useMoney } from "@/components/hud/useGameText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlayerAction, RunSnapshot } from "@/game";
import {
  ACQUISITION_IDS,
  ACQUISITIONS,
  UPGRADE_CATEGORIES,
  UPGRADES,
  type UpgradeCategory,
  type UpgradeId,
  upgradesIn,
} from "@/game/content";

/**
 * The shop: what money buys for the product and the tools, category by
 * category, and the companies it can buy outright, as a catalog of tiles
 * with the picked one in full beside them (`Catalog`).
 *
 * Each category is a ladder: what the run's tier has unlocked, then one
 * greyed rung for the tier after, and nothing beyond. A run learns there is
 * a Death Star by earning the Dyson swarm. The sites are the organisation's
 * ladder and hang in the hiring tab, next to the people they seat.
 */

export function Shop({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const { tier } = snapshot.economy;

  const sections: CatalogSection[] = UPGRADE_CATEGORIES.filter(
    (category) => category !== "org",
  ).map((category) => ({
    key: category,
    title: t(`category.${category}`),
    items: ladderOf(category, tier).map((id) => ({ kind: "upgrade" as const, id })),
  }));
  const acquisitions = ACQUISITION_IDS.filter((id) => ACQUISITIONS[id].tier <= tier + 1);
  if (acquisitions.length > 0) {
    sections.push({
      key: "acquisitions",
      title: t("acquisitions"),
      hint: t("acquisitionsHint"),
      items: acquisitions.map((id) => ({ kind: "acquisition" as const, id })),
    });
  }

  return (
    <Catalog
      sections={sections}
      snapshot={snapshot}
      onAct={onAct}
      header={
        snapshot.boosts.shopDiscountPct > 0 ? (
          <Badge>{t("shopDiscount", { pct: snapshot.boosts.shopDiscountPct })}</Badge>
        ) : null
      }
    />
  );
}

/**
 * One category's rungs: everything unlocked, then the first rung of the next
 * tier greyed as a promise, and the rest kept out of sight.
 */
export function ladderOf(category: UpgradeCategory, tier: number): UpgradeId[] {
  return upgradesIn(category).filter((id) => UPGRADES[id].tier <= tier + 1);
}

/** Money turned into a skill point: bought here, placed in the tree beside it. */
export function BuyPoint({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const point: PlayerAction = { type: "buy_point" };
  const offered = snapshot.actions.some((a) => a.type === "buy_point");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block">
          <Button size="sm" variant="outline" disabled={!offered} onClick={() => onAct(point)}>
            {t("buyPointFor", { money: money(snapshot.economy.skillPointPrice) })}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{t("buyPointHint")}</TooltipContent>
    </Tooltip>
  );
}
