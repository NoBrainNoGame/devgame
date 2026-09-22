"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";

import { formatMoney } from "@/components/hud/money";
import { type I18nText, renderText } from "@/game";

/**
 * Renders an engine-produced `I18nText`, resolving nested key references — a
 * log line that names a skill carries `skills.linter.name`, not "Linter", and
 * the engine has no idea which language it is in — and formatting sums of
 * money in the unit the run has reached.
 */
export function useGameText(): (value: I18nText) => string {
  const t = useTranslations("game");
  const locale = useLocale();

  return useCallback(
    (value: I18nText) =>
      renderText(
        (key, params) => t(key as never, params as never),
        value,
        (amount) => formatMoney(amount, locale),
      ),
    [t, locale],
  );
}

/**
 * The same formatter, for a component that shows a number of its own. A
 * balance line asks for the sign, so a gain reads "+1,2 k€" and stands
 * apart from a bill.
 */
export function useMoney(): (value: number, options?: { signed?: boolean }) => string {
  const locale = useLocale();
  return useCallback(
    (value: number, options?: { signed?: boolean }) => {
      const formatted = formatMoney(value, locale);
      return options?.signed === true && value > 0 ? `+${formatted}` : formatted;
    },
    [locale],
  );
}
