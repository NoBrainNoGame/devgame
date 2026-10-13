"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { PlayerAction } from "@/game";

/** The words for a move, as a pending bar or a log names it. */
export function useActionLabel(): (action: PlayerAction) => string {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  return useCallback(
    (action: PlayerAction): string => {
      switch (action.type) {
        case "commit": {
          const kind = action.kind ?? "commit";
          return game(`nodes.${kind}.${action.mode === "ai" ? "aiName" : "name"}` as never);
        }
        case "review":
          return t("review");
        case "rest":
          return t("rest");
        case "merge":
          return t("reviewMerge");
        case "resume":
          return t("reviewResume");
        case "hack":
          return t("hack.title");
        case "resolve_conflict":
          return action.how === "manual" ? t("conflictManual") : t("conflictAi");
        default:
          return action.type;
      }
    },
    [t, game],
  );
}
