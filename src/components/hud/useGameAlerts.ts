"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useMoney } from "@/components/hud/useGameText";
import { useGameStore } from "@/game";

/**
 * The events worth a toast: production about to saturate, a payday that
 * saturated, a tier reached. One per kind per turn, because a hundred
 * turns at ×100 must not raise a hundred toasts, and the warning carries
 * the rung the game would buy and a button to the shop.
 */
export function useGameAlerts(onOpenShop: () => void): void {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const money = useMoney();
  const events = useGameStore((state) => state.lastEvents);
  const snapshot = useGameStore((state) => state.snapshot);
  const shown = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (snapshot === null) return;
    const turn = snapshot.turn;
    const once = (kind: string): boolean => {
      if (shown.current.get(kind) === turn) return false;
      shown.current.set(kind, turn);
      return true;
    };
    const shopAction = { label: t("toastOpenShop"), onClick: onOpenShop };

    for (const event of events) {
      if (event.type === "capacity_warning" && once(`capacity:${event.level}`)) {
        const description =
          event.advice === undefined
            ? undefined
            : t("toastAdvice", {
                upgrade: game(`upgrades.${event.advice.id}.name` as never),
                money: money(event.advice.cost),
              });
        toast.warning(event.level === "saturated" ? t("toastSaturated") : t("toastWarning"), {
          ...(description === undefined ? {} : { description }),
          action: shopAction,
        });
      }
      if (event.type === "outage" && once("outage")) {
        toast.error(t("toastOutage", { pct: event.overPct }), { action: shopAction });
      }
      if (event.type === "tier_reached" && once("tier")) {
        toast.success(t("toastTier", { tier: event.tier }));
      }
      if (event.type === "hack" && once("hack")) {
        if (event.success) toast.success(t("toastHackWon"));
        else toast.error(t("toastHackLost"));
      }
    }
  }, [events, snapshot, t, game, money, onOpenShop]);
}
