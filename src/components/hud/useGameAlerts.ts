"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useMoney } from "@/components/hud/useGameText";
import { notify } from "@/components/ui/notify";
import { useGameStore } from "@/game";

/** Ids of the toasts that close on their own once their cause is gone. */
const CAPACITY_TOAST = "capacity";
const OUTAGE_TOAST = "outage";

/**
 * The events worth a toast: production about to saturate, a payday that
 * saturated, a tier reached, a hack. Each kind has one toast, replaced in
 * place when it fires again, so a hundred turns at ×100 raise one toast,
 * not a hundred.
 *
 * A toast stays until dealt with. The server ones carry the rung the game
 * would buy and a button to the shop; opening the shop is not fixing the
 * servers, so they stay up after it and close by themselves when the
 * capacity is back, or when the player closes them.
 */
export function useGameAlerts(onOpenShop: () => void): void {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const money = useMoney();
  const events = useGameStore((state) => state.lastEvents);
  const snapshot = useGameStore((state) => state.snapshot);
  const alert = useGameStore((state) => state.snapshot?.economy.alert ?? "ok");
  const shown = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (snapshot === null) return;
    const turn = snapshot.turn;
    const once = (kind: string): boolean => {
      if (shown.current.get(kind) === turn) return false;
      shown.current.set(kind, turn);
      return true;
    };
    const shopAction = { label: t("toastOpenShop"), onClick: onOpenShop, keepOpen: true };

    for (const event of events) {
      if (event.type === "capacity_warning" && once(`capacity:${event.level}`)) {
        const description =
          event.advice === undefined
            ? undefined
            : t("toastAdvice", {
                upgrade: game(`upgrades.${event.advice.id}.name` as never),
                money: money(event.advice.cost),
              });
        const title = event.level === "saturated" ? t("toastSaturated") : t("toastWarning");
        const options = {
          id: CAPACITY_TOAST,
          action: shopAction,
          ...(description === undefined ? {} : { description }),
        };
        if (event.level === "saturated") notify.error(title, options);
        else notify.warning(title, options);
      }
      if (event.type === "outage" && once("outage")) {
        notify.error(t("toastOutage", { pct: event.overPct }), {
          id: OUTAGE_TOAST,
          action: shopAction,
        });
      }
      if (event.type === "tier_reached" && once("tier")) {
        notify.success(t("toastTier", { tier: event.tier }), { id: `tier-${event.tier}` });
      }
      if (event.type === "hack" && once("hack")) {
        if (event.success) notify.success(t("toastHackWon"), { id: "hack" });
        else notify.error(t("toastHackLost"), { id: "hack" });
      }
    }
  }, [events, snapshot, t, game, money, onOpenShop]);

  // The servers hold again: their warnings have been dealt with.
  useEffect(() => {
    if (alert !== "ok") return;
    notify.dismiss(CAPACITY_TOAST);
    notify.dismiss(OUTAGE_TOAST);
  }, [alert]);
}
