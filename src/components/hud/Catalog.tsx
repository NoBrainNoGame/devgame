"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useGameText, useMoney } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import type { PlayerAction, RunSnapshot } from "@/game";
import { actionKey } from "@/game";
import {
  ACQUISITIONS,
  type AcquisitionId,
  DEV_RANK,
  type DevRank,
  discounted,
  UPGRADES,
  type UpgradeId,
  upgradeCost,
} from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * What money buys, laid out as a shop window: every offer a tile of the same
 * size — its name, where it stands, its price — and beside them a panel with
 * the one the player picked, in full: what it does, what it costs to keep,
 * what it changes, why it cannot be bought yet, and the button that buys it.
 * The pick survives a purchase, so a ladder climbs rung after rung from the
 * same panel.
 */

export type CatalogItem =
  | { kind: "upgrade"; id: UpgradeId }
  | { kind: "acquisition"; id: AcquisitionId }
  | { kind: "hire"; rank: DevRank };

export interface CatalogSection {
  key: string;
  title: string;
  hint?: string;
  items: readonly CatalogItem[];
}

function keyOf(item: CatalogItem): string {
  return item.kind === "hire" ? `hire:${item.rank}` : `${item.kind}:${item.id}`;
}

export function Catalog({
  sections,
  snapshot,
  onAct,
  header,
}: {
  sections: readonly CatalogSection[];
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
  /** Above the tiles: a discount, a free hire. */
  header?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = sections.flatMap((s) => s.items).find((item) => keyOf(item) === picked) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        {header}
        {sections.map((section) => (
          <section key={section.key} className="space-y-2">
            <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {section.title}
            </h3>
            {section.hint === undefined ? null : (
              <p className="text-muted-foreground text-xs">{section.hint}</p>
            )}
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
              {section.items.map((item) => (
                <Tile
                  key={keyOf(item)}
                  item={item}
                  snapshot={snapshot}
                  selected={picked === keyOf(item)}
                  onSelect={() => setPicked(keyOf(item))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <Detail item={selected} snapshot={snapshot} onAct={onAct} />
    </div>
  );
}

/** Everything a tile and the panel say about one offer, from the snapshot. */
interface Facts {
  name: string;
  /** What kind of offer: its category, a hire, an acquisition. */
  group: string;
  desc: string | null;
  /** Where it stands: its level, the tier it waits for, or that it is had. */
  status: string | null;
  /** The price of the next one; null once there is no next one. */
  price: number | null;
  action: PlayerAction;
  offered: boolean;
  locked: boolean;
  /** Maxed out, or bought for good. */
  done: boolean;
  doneLabel: string;
  lines: string[];
  /** Why it cannot be bought now, when that is not obvious. */
  blocked: string | null;
}

function useFacts(item: CatalogItem, snapshot: RunSnapshot): Facts {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const money = useMoney();
  const { economy } = snapshot;
  const offeredFor = (action: PlayerAction): boolean =>
    snapshot.actions.some((a) => actionKey(a) === actionKey(action));
  const shortBy = (price: number | null): string | null =>
    price !== null && price > economy.money
      ? t("catalogShort", { money: money(price - economy.money) })
      : null;

  if (item.kind === "upgrade") {
    const def = UPGRADES[item.id];
    const level = snapshot.upgrades[item.id] ?? 0;
    const listed = upgradeCost(item.id, level);
    const price = listed === undefined ? null : discounted(listed, snapshot.boosts.shopDiscountPct);
    const locked = def.tier > economy.tier;
    const action: PlayerAction = { type: "buy", id: item.id };
    const offered = offeredFor(action);
    const lines: string[] = [];
    if (def.upkeep > 0) {
      lines.push(t("upkeepPerLevel", { money: money(def.upkeep) }));
      if (level > 0) lines.push(t("upkeepNow", { money: money(def.upkeep * level) }));
    }
    return {
      name: game(`upgrades.${item.id}.name` as never),
      group: def.category === "org" ? t("sites") : t(`category.${def.category}`),
      desc: game(`upgrades.${item.id}.desc` as never),
      status: locked
        ? t("nextTier", { tier: def.tier })
        : def.maxLevel === undefined
          ? level > 0
            ? t("levelOf", { level })
            : null
          : def.maxLevel > 1
            ? `${level}/${def.maxLevel}`
            : null,
      price,
      action,
      offered,
      locked,
      done: price === null,
      doneLabel: t("treeMaxed"),
      lines,
      blocked: offered || locked || price === null ? null : shortBy(price),
    };
  }

  if (item.kind === "acquisition") {
    const def = ACQUISITIONS[item.id];
    const bought = economy.acquisitions.includes(item.id);
    const locked = def.tier > economy.tier;
    const action: PlayerAction = { type: "acquire", id: item.id };
    const offered = offeredFor(action);
    return {
      name: game(`acquisitions.${item.id}.name` as never),
      group: t("acquisitions"),
      desc: game(`acquisitions.${item.id}.desc` as never),
      status: locked ? t("nextTier", { tier: def.tier }) : null,
      price: bought ? null : def.cost,
      action,
      offered,
      locked,
      done: bought,
      doneLabel: t("acquired"),
      lines: [],
      blocked: offered || locked || bought ? null : shortBy(def.cost),
    };
  }

  const rank = DEV_RANK[item.rank];
  const locked = rank.tier > economy.tier;
  const action: PlayerAction = { type: "hire", rank: item.rank };
  const offered = offeredFor(action);
  const price = economy.hireCosts[item.rank];
  const full = economy.seats.used >= economy.seats.max;
  return {
    name: game(`ranks.${item.rank}.name` as never),
    group: t("hire"),
    desc: null,
    status: locked ? t("nextTier", { tier: rank.tier }) : null,
    price,
    action,
    offered,
    locked,
    done: false,
    doneLabel: "",
    lines: [
      t("rankCapacity", { count: rank.capacity }),
      t("rankSpeed", { count: rank.speed }),
      t("rankSalary", { money: money(rank.salary) }),
    ],
    blocked: offered || locked ? null : full ? t("catalogNoSeat") : shortBy(price),
  };
}

function Tile({
  item,
  snapshot,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  snapshot: RunSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  const money = useMoney();
  const facts = useFacts(item, snapshot);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex h-24 min-w-0 flex-col justify-between border bg-panel/60 p-2.5 text-left text-sm transition-colors",
        "hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-ring",
        facts.offered ? "border-cyber/40" : "border-line",
        facts.done && "border-branch-main/40",
        facts.locked && "opacity-60",
        selected && "border-foreground bg-panel",
      )}
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="line-clamp-2 font-medium leading-tight">{facts.name}</span>
        {facts.status === null ? null : (
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {facts.status}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-xs tabular-nums",
          facts.done ? "text-branch-main" : facts.offered ? "text-money" : "text-muted-foreground",
        )}
      >
        {facts.done ? facts.doneLabel : facts.price === null ? "" : money(facts.price)}
      </span>
    </button>
  );
}

function Detail({
  item,
  snapshot,
  onAct,
}: {
  item: CatalogItem | null;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  if (item === null) {
    return (
      <aside className="catalog-detail self-start p-4 text-muted-foreground text-sm lg:sticky lg:top-0">
        {t("catalogPick")}
      </aside>
    );
  }
  return <DetailOf item={item} snapshot={snapshot} onAct={onAct} />;
}

function DetailOf({
  item,
  snapshot,
  onAct,
}: {
  item: CatalogItem;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const render = useGameText();
  const facts = useFacts(item, snapshot);
  const preview = snapshot.previews[actionKey(facts.action)];

  return (
    <aside
      className="catalog-detail space-y-3 self-start p-4 text-sm lg:sticky lg:top-0"
      aria-live="polite"
    >
      <div className="space-y-0.5">
        <p className="text-muted-foreground text-xs uppercase tracking-wider">{facts.group}</p>
        <h4 className="font-medium text-base">{facts.name}</h4>
        {facts.status === null ? null : (
          <p className="text-muted-foreground text-xs tabular-nums">{facts.status}</p>
        )}
      </div>
      {facts.desc === null ? null : (
        <p className="text-muted-foreground leading-relaxed">{facts.desc}</p>
      )}
      {facts.lines.length === 0 ? null : (
        <ul className="space-y-0.5 text-muted-foreground text-xs">
          {facts.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {preview?.notes.length ? (
        <ul className="space-y-0.5 border-line border-t pt-2 text-xs">
          {preview.notes.map((note) => (
            <li key={note.key}>{render(note)}</li>
          ))}
        </ul>
      ) : null}
      {facts.blocked === null ? null : (
        <p className="text-branch-hotfix text-xs">{facts.blocked}</p>
      )}
      <Button
        className="w-full"
        variant={facts.offered ? "default" : "outline"}
        disabled={!facts.offered}
        onClick={() => onAct(facts.action)}
      >
        {facts.done
          ? facts.doneLabel
          : facts.locked
            ? (facts.status ?? "")
            : t("buyFor", { money: money(facts.price ?? 0) })}
      </Button>
    </aside>
  );
}
