"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useStore } from "zustand";

import { ACHIEVEMENT_ICONS, GROUP_TONE } from "@/components/achievements/icons";
import { announcements, dismissAnnouncement } from "@/components/achievements/unlocks";
import { useReducedMotion } from "@/components/hud/motion";
import { ACHIEVEMENTS } from "@/game/content";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { cn } from "@/lib/utils";

/** Long enough to read a name, short enough not to sit on the graph. */
const SHOWN_MS = 4_500;

/**
 * "Achievement unlocked", the way a console says it: a capsule rising at the
 * bottom of the screen, one at a time, gone on its own. Not a toast — a
 * toast waits to be dealt with, and there is nothing to deal with here.
 */
export function AchievementPopup() {
  const t = useTranslations("achievements");
  const current = useStore(announcements, (state) => state.queue[0]);
  // Outside the run's stage, so the profile's own setting is read here.
  const setting = useMetaStore((state) => state.meta.settings.reducedMotion);
  const reduced = useReducedMotion() || setting;

  useEffect(() => {
    if (current === undefined) return;
    const timer = setTimeout(dismissAnnouncement, SHOWN_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (current === undefined) return null;
  const Icon = ACHIEVEMENT_ICONS[current];
  const tone = GROUP_TONE[ACHIEVEMENTS[current].group];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <button
        key={current}
        type="button"
        title={t("dismiss")}
        onClick={dismissAnnouncement}
        className={cn(
          "pointer-events-auto flex max-w-sm items-center gap-3 rounded-full border border-line bg-panel/95 py-2 pr-5 pl-2 text-left shadow-[0_0_24px_-6px_currentColor] backdrop-blur-sm",
          tone,
          !reduced && "fade-in slide-in-from-bottom-6 animate-in duration-500",
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-current">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-muted-foreground text-xs uppercase tracking-wider">
            {t("unlocked")}
          </span>
          <span className="block truncate font-medium text-foreground">
            {t(`items.${current}.name` as never)}
          </span>
        </span>
      </button>
    </div>
  );
}
