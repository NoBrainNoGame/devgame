"use client";

import { Check, Lock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { ACHIEVEMENT_ICONS, GROUP_TONE } from "@/components/achievements/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  type AchievementGroup,
  type AchievementId,
  nextOnRoute,
} from "@/game/content";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { cn } from "@/lib/utils";

/**
 * The collection: how much of it is had, then the route in its order with
 * the next step marked, the prestige goals, and the secrets — a padlock and
 * a question mark until earned, their name and their joke after.
 */
export function AchievementsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("achievements");
  const records = useMetaStore((state) => state.meta.achievements);
  const earned = new Map<string, string>(records.map((record) => [record.id, record.at]));
  const next = nextOnRoute(new Set(earned.keys()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground text-xs tabular-nums">
            <span>{t("title")}</span>
            <span>{t("count", { count: earned.size, total: ACHIEVEMENT_IDS.length })}</span>
          </div>
          <Progress
            value={(earned.size / ACHIEVEMENT_IDS.length) * 100}
            className="[&>*]:bg-cyber"
          />
        </div>
        {ACHIEVEMENT_GROUPS.map((group) => (
          <Group key={group} group={group} earned={earned} next={next} />
        ))}
      </DialogContent>
    </Dialog>
  );
}

function Group({
  group,
  earned,
  next,
}: {
  group: AchievementGroup;
  earned: ReadonlyMap<string, string>;
  next: AchievementId | null;
}) {
  const t = useTranslations("achievements");
  const ids = ACHIEVEMENT_IDS.filter((id) => ACHIEVEMENTS[id].group === group);
  const had = ids.filter((id) => earned.has(id)).length;

  return (
    <section className="space-y-2">
      <h3 className="hud-title flex justify-between font-medium text-muted-foreground text-xs uppercase tracking-wider">
        <span>{t(`groups.${group}`)}</span>
        <span className="tabular-nums">{t("count", { count: had, total: ids.length })}</span>
      </h3>
      <ol
        className={cn(
          "grid gap-2",
          group === "route" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {ids.map((id) => (
          <Item key={id} id={id} at={earned.get(id)} next={id === next} />
        ))}
      </ol>
    </section>
  );
}

function Item({ id, at, next }: { id: AchievementId; at: string | undefined; next: boolean }) {
  const t = useTranslations("achievements");
  const format = useFormatter();
  const { group } = ACHIEVEMENTS[id];
  const had = at !== undefined;
  const hidden = group === "secret" && !had;
  const Icon = hidden ? Lock : ACHIEVEMENT_ICONS[id];

  return (
    <li
      className={cn(
        "flex gap-3 border bg-panel/60 p-2.5 text-sm",
        had ? "border-line" : "border-line/60",
        next && "border-cyber/60 bg-cyber/5",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border",
          had ? cn("border-current", GROUP_TONE[group]) : "border-line text-muted-foreground/60",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span
          className={cn("flex items-center gap-1.5 font-medium", !had && "text-muted-foreground")}
        >
          {hidden ? t("secretName") : t(`items.${id}.name` as never)}
          {had ? <Check className="size-3.5 text-branch-main" aria-hidden /> : null}
        </span>
        <span className="block text-muted-foreground text-xs leading-relaxed">
          {hidden ? t("secretHint") : t(`items.${id}.desc` as never)}
        </span>
        {had ? (
          <span className="block text-muted-foreground/80 text-xs">
            {t("earnedOn", { date: format.dateTime(new Date(at), { dateStyle: "medium" }) })}
          </span>
        ) : next ? (
          <span className="block text-cyber text-xs">{t("next")}</span>
        ) : null}
      </span>
    </li>
  );
}
