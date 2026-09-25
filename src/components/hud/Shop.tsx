"use client";

import { useTranslations } from "next-intl";

import { useGameText, useMoney } from "@/components/hud/useGameText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlayerAction, RunSnapshot } from "@/game";
import { actionKey } from "@/game";
import {
  discounted,
  UPGRADE_CATEGORIES,
  UPGRADES,
  type UpgradeCategory,
  type UpgradeId,
  upgradeCost,
  upgradesIn,
} from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * The shop: what money buys for the product and the tools, category by
 * category.
 *
 * Each category is a ladder: what the run's tier has unlocked, then one
 * greyed rung for the tier after, and nothing beyond. A run learns there is
 * a Death Star by earning the Dyson swarm. The sites are the organisation's
 * ladder and hang in the team tab, next to the people they seat.
 */

export function Shop({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");

  return (
    <div className="space-y-5">
      {snapshot.boosts.shopDiscountPct > 0 ? (
        <Badge>{t("shopDiscount", { pct: snapshot.boosts.shopDiscountPct })}</Badge>
      ) : null}
      {UPGRADE_CATEGORIES.filter((category) => category !== "org").map((category) => (
        <section key={category} className="min-w-0 space-y-2">
          <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t(`category.${category}`)}
          </h3>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
            <Ladder category={category} snapshot={snapshot} onAct={onAct} />
          </div>
        </section>
      ))}
    </div>
  );
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

/**
 * One category's rungs: everything unlocked, then the first rung of the next
 * tier greyed as a promise, and the rest kept out of sight.
 */
export function Ladder({
  category,
  snapshot,
  onAct,
}: {
  category: UpgradeCategory;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const tier = snapshot.economy.tier;
  const shown = upgradesIn(category).filter((id) => UPGRADES[id].tier <= tier + 1);
  return (
    <div className="contents">
      {shown.map((id) => (
        <UpgradeCard key={id} id={id} snapshot={snapshot} onAct={onAct} />
      ))}
    </div>
  );
}

function UpgradeCard({
  id,
  snapshot,
  onAct,
}: {
  id: UpgradeId;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const render = useGameText();

  const def = UPGRADES[id];
  const level = snapshot.upgrades[id] ?? 0;
  const listed = upgradeCost(id, level);
  const cost =
    listed === undefined ? undefined : discounted(listed, snapshot.boosts.shopDiscountPct);
  const maxed = cost === undefined;
  const locked = def.tier > snapshot.economy.tier;
  const action: PlayerAction = { type: "buy", id };
  const offered = snapshot.actions.some((a) => a.type === "buy" && a.id === id);
  const preview = snapshot.previews[actionKey(action)];

  return (
    <article
      className={cn(
        "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
        maxed && "border-branch-main/60",
        locked && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{game(`upgrades.${id}.name` as never)}</span>
        {locked ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            {t("nextTier", { tier: def.tier })}
          </span>
        ) : def.maxLevel === undefined ? (
          level > 0 ? (
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {t("levelOf", { level })}
            </span>
          ) : null
        ) : def.maxLevel > 1 ? (
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {level}/{def.maxLevel}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {game(`upgrades.${id}.desc` as never)}
      </p>
      {def.upkeep > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("upkeepPerLevel", { money: money(def.upkeep) })}
          {level > 0 ? ` · ${t("upkeepNow", { money: money(def.upkeep * level) })}` : ""}
        </p>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">
            <Button
              size="sm"
              variant={offered ? "default" : "outline"}
              className="w-full"
              disabled={!offered}
              onClick={() => onAct(action)}
            >
              {maxed ? t("treeMaxed") : t("buyFor", { money: money(cost) })}
            </Button>
          </span>
        </TooltipTrigger>
        {preview?.notes.length ? (
          <TooltipContent side="bottom">
            {preview.notes.map((note) => (
              <p key={note.key}>{render(note)}</p>
            ))}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </article>
  );
}
