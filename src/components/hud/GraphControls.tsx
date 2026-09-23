"use client";

import { Crosshair, Maximize2, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GameHandle } from "@/game";
import { useGameStore } from "@/game";
import { audioService } from "@/game/audio/AudioService";
import { useMetaStore } from "@/lib/storage/useMetaStore";
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
  const meta = useMetaStore((state) => state.meta);
  const setMeta = useMetaStore((state) => state.setMeta);
  const sound = meta.settings.sound;
  // The one place the setting reaches the sound engine: a change here is a
  // change there, and a remount reads it again.
  useEffect(() => {
    audioService().setMuted(!sound);
  }, [sound]);
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
      <Control label={t("zoomFit")} onClick={() => handle?.camera.fit()}>
        <Maximize2 className="size-4" />
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
        onClick={() => setMeta({ ...meta, settings: { ...meta.settings, sound: !sound } })}
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
