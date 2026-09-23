"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * The HUD's words by tier. A key under `hud.tiered.t<n>` replaces the base
 * key from tier n on, and stays until a higher tier replaces it again; a
 * base key with no override reads as always. Every button keeps its
 * function — only the labels, the hints and who they address change, the
 * way `docs/lore.md` says they do. `tests/messages.test.ts` checks every
 * tiered key shadows a key that exists.
 */
export function useTiered(
  tier: number,
): (key: string, values?: Record<string, string | number>) => string {
  const t = useTranslations("hud");
  return useCallback(
    (key: string, values?: Record<string, string | number>) => {
      for (let level = Math.min(6, tier); level >= 1; level -= 1) {
        const candidate = `tiered.t${level}.${key}`;
        if (t.has(candidate as never)) return t(candidate as never, values as never);
      }
      return t(key as never, values as never);
    },
    [t, tier],
  );
}
