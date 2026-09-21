"use client";

import { useTranslations } from "next-intl";

import { Progress } from "@/components/ui/progress";
import type { RunSnapshot } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The rivals, with the one number the original design never showed: how close
 * each of them is to being let go. Without it, "keep your reputation up" is
 * advice; with it, it is a target.
 */
export function BotPanel({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  const alive = snapshot.bots.filter((bot) => !bot.fired);
  if (alive.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("rivalsTitle")}
      </h2>

      {alive.map((bot) => {
        const lead = snapshot.player.sprintProgress - bot.sprintProgress;
        const firingPct = (bot.firingProgress / bot.firingTurns) * 100;

        return (
          <div key={bot.id} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-branch-bot">{game(`bots.${bot.archetype}.name` as never)}</span>
              <span
                className={cn(
                  "tabular-nums text-xs",
                  lead > 0 ? "text-branch-main" : "text-branch-hotfix",
                )}
              >
                {lead > 0 ? `+${lead}` : lead}
              </span>
            </div>

            <Progress value={firingPct} className="h-1.5 [&>*]:bg-branch-bot" />

            <p className="text-muted-foreground text-xs">
              {bot.stalled
                ? t("rivalStalled")
                : `${t("rivalFiring")} ${bot.firingProgress}/${bot.firingTurns}`}
            </p>
          </div>
        );
      })}
    </section>
  );
}
