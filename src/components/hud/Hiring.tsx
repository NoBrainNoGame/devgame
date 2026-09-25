"use client";

import { useTranslations } from "next-intl";

import { Ladder } from "@/components/hud/Shop";
import { useGameText, useMoney } from "@/components/hud/useGameText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlayerAction, RunSnapshot } from "@/game";
import { actionKey } from "@/game";
import { DEV_RANK, DEV_RANKS } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * Hiring: the ranks there is money and room for, and the sites that make the
 * room. The team works on its own once hired; who is there, and what they
 * hold, is read in the company dialog's team tab.
 */
export function Hiring({
  snapshot,
  onAct,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");
  const render = useGameText();

  const { seats, tier } = snapshot.economy;

  return (
    <div className="space-y-4">
      {snapshot.boosts.freeHire ? <Badge>{t("freeHire")}</Badge> : null}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("hire")}
          </h3>
          <span
            className={cn(
              "text-xs tabular-nums",
              seats.used >= seats.max ? "text-branch-hotfix" : "text-muted-foreground",
            )}
          >
            {t("seats", { used: seats.used, max: seats.max })}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t("hireHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEV_RANKS.map((rank) => {
            const action: PlayerAction = { type: "hire", rank };
            const offered = snapshot.actions.some((a) => a.type === "hire" && a.rank === rank);
            const preview = snapshot.previews[actionKey(action)];
            const locked = DEV_RANK[rank].tier > tier;
            return (
              <article
                key={rank}
                className={cn(
                  "space-y-1.5 rounded-md border border-line bg-panel/60 p-3 text-sm",
                  locked && "opacity-60",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{game(`ranks.${rank}.name` as never)}</p>
                  {locked ? (
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {t("nextTier", { tier: DEV_RANK[rank].tier })}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("rankCapacity", { count: DEV_RANK[rank].capacity })}
                  {" · "}
                  {t("rankSpeed", { count: DEV_RANK[rank].speed })}
                  {" · "}
                  {t("rankSalary", { money: money(DEV_RANK[rank].salary) })}
                </p>
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
                        {t("buyFor", { money: money(snapshot.economy.hireCosts[rank]) })}
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
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("sites")}
        </h3>
        <p className="text-muted-foreground text-xs">{t("sitesHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Ladder category="org" snapshot={snapshot} onAct={onAct} />
        </div>
      </section>
    </div>
  );
}
