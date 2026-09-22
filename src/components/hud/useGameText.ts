"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { type I18nText, renderText } from "@/game";

/**
 * Renders an engine-produced `I18nText`, resolving nested key references — a
 * log line that names a skill carries `skills.linter.name`, not "Linter", and
 * the engine has no idea which language it is in.
 */
export function useGameText(): (value: I18nText) => string {
  const t = useTranslations("game");

  return useCallback(
    (value: I18nText) => renderText((key, params) => t(key as never, params as never), value),
    [t],
  );
}
