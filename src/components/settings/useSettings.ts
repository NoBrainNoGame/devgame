"use client";

import { useCallback, useEffect } from "react";

import type { SettingsDto } from "@/game";
import { audioService } from "@/game/audio/AudioService";
import { useMetaStore } from "@/lib/storage/useMetaStore";

/**
 * The player's settings, and the one way to change them. A change is dated:
 * `mergeMeta` lets the most recent copy's settings win, so a change left
 * undated would lose to an older cloud copy at the next sync.
 */
export function useSettings(): {
  settings: SettingsDto;
  update: (patch: Partial<SettingsDto>) => void;
} {
  const settings = useMetaStore((state) => state.meta.settings);
  const update = useCallback((patch: Partial<SettingsDto>) => {
    const { meta, setMeta } = useMetaStore.getState();
    setMeta({
      ...meta,
      settings: { ...meta.settings, ...patch },
      updatedAt: new Date().toISOString(),
    });
  }, []);
  return { settings, update };
}

/**
 * Where the settings reach the sound engine: the switch and the two levels.
 * Mounted once by the run's page, so a remount reads them again and no
 * control on screen has to be the one that carries them.
 */
export function useAudioSettings(): void {
  const { sound, musicVolume, sfxVolume } = useMetaStore((state) => state.meta.settings);
  useEffect(() => {
    audioService().setMuted(!sound);
  }, [sound]);
  useEffect(() => {
    audioService().setVolumes({ music: musicVolume / 100, sfx: sfxVolume / 100 });
  }, [musicVolume, sfxVolume]);
}
