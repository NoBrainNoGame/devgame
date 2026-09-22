"use client";

import { useEffect } from "react";

import {
  hydrateIdleSettings,
  type IdleSettings,
  setIdleSettings,
  useIdleStore,
} from "@/components/hud/idleStore";

/** The idle clock's preferences, read from the shared store. */
export function useIdleSettings(): [IdleSettings, (next: Partial<IdleSettings>) => void] {
  const settings = useIdleStore((state) => state.settings);
  useEffect(hydrateIdleSettings, []);
  return [settings, setIdleSettings];
}
