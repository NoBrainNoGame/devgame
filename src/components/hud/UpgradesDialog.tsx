"use client";

import { useTranslations } from "next-intl";

import { Hiring } from "@/components/hud/Hiring";
import { BuyPoint, Shop } from "@/components/hud/Shop";
import { SkillTree } from "@/components/hud/SkillTree";
import { UPGRADES_TABS, type UpgradesTab } from "@/components/hud/upgradeOffers";
import { useMoney } from "@/components/hud/useGameText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlayerAction, RunSnapshot } from "@/game";

/**
 * Everything that makes the run stronger, one tab per kind of spending:
 * skill points in the tree, money on the team, money in the shop. All three
 * are spent without spending a turn, so the dialog stays open across
 * purchases; the snapshot republishes after each and the tabs update in
 * place. A tab with something new in it carries a dot until it is shown.
 */
export function UpgradesDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  news,
  snapshot,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: UpgradesTab;
  onTabChange: (tab: UpgradesTab) => void;
  /** Which tabs hold an offer not seen yet. */
  news: Record<UpgradesTab, boolean>;
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

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = UPGRADES_TABS.find((id) => id === value);
            if (next !== undefined) onTabChange(next);
          }}
          className="flex min-h-0 flex-col"
        >
          <TabsList variant="line">
            {UPGRADES_TABS.map((id) => (
              <TabsTrigger key={id} value={id} className="gap-1.5">
                {t(`upgradesTabs.${id}`)}
                {news[id] && id !== tab ? (
                  <span
                    role="img"
                    aria-label={t("upgradesTabNews")}
                    className="upgrades-tab-news size-1.5 rounded-full bg-cyber"
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="skills" className="min-h-0 space-y-3 overflow-y-auto pt-3 pr-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">{t("treeIntro")}</p>
              <BuyPoint snapshot={snapshot} onAct={onAct} />
            </div>
            <SkillTree snapshot={snapshot} onAct={onAct} />
          </TabsContent>
          <TabsContent value="hiring" className="min-h-0 overflow-y-auto pt-3 pr-2">
            <Hiring snapshot={snapshot} onAct={onAct} />
          </TabsContent>
          <TabsContent value="purchases" className="min-h-0 overflow-y-auto pt-3 pr-2">
            <Shop snapshot={snapshot} onAct={onAct} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
