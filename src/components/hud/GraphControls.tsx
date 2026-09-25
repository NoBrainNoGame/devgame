"use client";

import { Crosshair, Minus, MoveHorizontal, Plus, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSettings } from "@/components/settings/useSettings";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GameHandle } from "@/game";
import { useGameStore } from "@/game";
import { cn } from "@/lib/utils";

/**
 * Zoom, fit, and a way back to your head commit.
 *
 * The recentre button lights up only when the camera has been let loose,
 * because that is the only time it does anything — and its being lit is also
 * how a player learns that dragging took them off the leash.
 */
export function GraphControls({ handle }: { handle: GameHandle | null }): React.JSX.Element {
  const t = useTranslations("hud");
  const { settings, update } = useSettings();
  const sound = settings.sound;
  const zoom = useGameStore((state) => state.zoom);
  const following = useGameStore((state) => state.cameraFollowing);

  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-md border border-line bg-panel/90 p-1 backdrop-blur-sm">
      <span className="px-2 text-muted-foreground text-xs tabular-nums">
        {Math.round(zoom * 100)} %
      </span>

      <Control label={t("zoomOut")} onClick={() => handle?.camera.zoomOut()}>
        <Minus className="size-4" />
      </Control>
      <Control label={t("zoomIn")} onClick={() => handle?.camera.zoomIn()}>
        <Plus className="size-4" />
      </Control>
      <Control label={t("zoomFitWidth")} onClick={() => handle?.camera.fitWidth()}>
        <MoveHorizontal className="size-4" />
      </Control>
      <Control
        label={t("recentre")}
        onClick={() => handle?.camera.recentre()}
        highlighted={!following}
      >
        <Crosshair className="size-4" />
      </Control>
      <Control
        label={sound ? t("soundOn") : t("soundOff")}
        onClick={() => update({ sound: !sound })}
        highlighted={!sound}
      >
        {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </Control>
    </div>
  );
}

function Control({
  label,
  onClick,
  highlighted,
  children,
}: {
  label: string;
  onClick: () => void;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          onClick={onClick}
          className={cn("size-8", highlighted === true && "text-branch-main")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
