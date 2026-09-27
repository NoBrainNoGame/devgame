"use client";

import { useTranslations } from "next-intl";

import { ACHIEVEMENT_ICONS } from "@/components/achievements/icons";
import { ACHIEVEMENT_ROUTE, nextOnRoute } from "@/game/content";
import { useMetaStore } from "@/lib/storage/useMetaStore";

/**
 * The tutorial, as a road: the next step not yet taken, what to do for it,
 * and how far along the road is. Gone once the road is walked — the rest of
 * the collection is in the achievements window.
 */
export function RouteCard({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("achievements");
  const records = useMetaStore((state) => state.meta.achievements);
  const hydrated = useMetaStore((state) => state.hydrated);
  const earned = new Set<string>(records.map((record) => record.id));
  const next = nextOnRoute(earned);

  if (!hydrated || next === null) return null;
  const done = ACHIEVEMENT_ROUTE.filter((id) => earned.has(id)).length;
  const Icon = ACHIEVEMENT_ICONS[next];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full space-y-1.5 border border-cyber/40 bg-cyber/5 p-3 text-left text-sm transition-colors hover:border-cyber focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
        <span>{t("next")}</span>
        <span className="tabular-nums">
          {t("routeProgress", { done, total: ACHIEVEMENT_ROUTE.length })}
        </span>
      </span>
      <span className="flex items-center gap-2 font-medium text-cyber">
        <Icon className="size-4 shrink-0" aria-hidden />
        {t(`items.${next}.name` as never)}
      </span>
      <span className="block text-muted-foreground text-xs leading-relaxed">
        {t(`items.${next}.desc` as never)}
      </span>
    </button>
  );
}
