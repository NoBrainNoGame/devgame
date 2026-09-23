"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { IDLE_SECONDS } from "@/components/hud/IdleDriver";
import { IDLE_SPEEDS, useIdleStore } from "@/components/hud/idleStore";
import { useIdleSettings } from "@/components/hud/useIdleSettings";
import { useTiered } from "@/components/hud/useTiered";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { idleSpeedAllowed, useGameStore } from "@/game";

/**
 * The idle clock's switch and speeds. Shown in every phase, since the clock
 * now plays every phase: ×10 and ×100 stay locked until the tree unlocks
 * them, and say so.
 */
export function IdleControls(): React.JSX.Element {
  const t = useTranslations("hud");
  const [idle, setIdle] = useIdleSettings();
  const tier = useGameStore((state) => state.snapshot?.idleSpeedTier ?? 0);
  const tiered = useTiered(useGameStore((state) => state.snapshot?.economy.tier ?? 0));
  const hydrated = useIdleStore((state) => state.hydrated);
  const effective = idleSpeedAllowed(tier, idle.speed) ? idle.speed : 1;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="xs"
            variant={idle.enabled ? "secondary" : "outline"}
            aria-pressed={idle.enabled}
            disabled={!hydrated}
            onClick={() => setIdle({ enabled: !idle.enabled })}
          >
            {idle.enabled ? <Pause /> : <Play />}
            {tiered("idleAuto")}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64">
          {idle.enabled ? t("idleOnHint", { seconds: IDLE_SECONDS / effective }) : t("idleOffHint")}
        </TooltipContent>
      </Tooltip>
      <fieldset className="ml-auto flex gap-0.5 border-0 p-0" aria-label={t("idleSpeed")}>
        {IDLE_SPEEDS.map((speed, index) => {
          const allowed = idleSpeedAllowed(tier, speed);
          const button = (
            <Button
              key={speed}
              size="xs"
              variant={idle.speed === speed ? "secondary" : "ghost"}
              aria-pressed={idle.speed === speed}
              disabled={!idle.enabled || !allowed}
              className="px-1.5 tabular-nums"
              onClick={() => setIdle({ speed })}
            >
              ×{speed}
            </Button>
          );
          if (allowed) return button;
          return (
            <Tooltip key={speed}>
              <TooltipTrigger asChild>
                <span>{button}</span>
              </TooltipTrigger>
              <TooltipContent side="left">{t("idleSpeedLocked", { level: index })}</TooltipContent>
            </Tooltip>
          );
        })}
      </fieldset>
    </div>
  );
}
