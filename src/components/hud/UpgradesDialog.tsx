"use client";

import { useTranslations } from "next-intl";

import { BuyPoint, Shop } from "@/components/hud/Shop";
import { SkillTree } from "@/components/hud/SkillTree";
import { useMoney } from "@/components/hud/useGameText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot } from "@/game";

/**
 * Everything that makes the run stronger, side by side: what money buys on
 * one side, where skill points go on the other. Both are spent without
 * spending a turn, so the dialog stays open across purchases; the snapshot
 * republishes after each and both sides update in place.
 */
export function UpgradesDialog({
  open,
  onOpenChange,
  snapshot,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(92dvh,64rem)] sm:max-w-[min(96vw,112rem)]"
        frameClassName="h-full grid-rows-[auto_minmax(0,1fr)]"
      >
        <DialogHeader>
          <DialogTitle>{t("upgradesTitle")}</DialogTitle>
          <DialogDescription>
            <span className="text-money tabular-nums">
              {t("money", { money: money(snapshot.economy.money) })}
            </span>
            {" · "}
            <span className="text-cyber tabular-nums">
              {t("treePoints", { count: snapshot.skillPoints })}
            </span>
            {" · "}
            {t("upgradesHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:overflow-hidden">
          <section className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            <h3 className="hud-title font-medium text-sm uppercase tracking-wider">{t("shop")}</h3>
            <Shop snapshot={snapshot} onAct={onAct} />
          </section>

          <section className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="hud-title font-medium text-sm uppercase tracking-wider">
                {t("tree")}
              </h3>
              <BuyPoint snapshot={snapshot} onAct={onAct} />
            </div>
            <SkillTree snapshot={snapshot} onAct={onAct} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
