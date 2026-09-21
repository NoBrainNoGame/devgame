"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Ticks down to the next daily rollover.
 *
 * `initialMs` is computed on the server so the first paint already shows the
 * right number — deriving it from `Date.now()` on mount would render a blank
 * or a mismatched value and then jump.
 */
export function DailyCountdown({ initialMs }: { initialMs: number }): React.JSX.Element {
  const t = useTranslations("leaderboard");
  const [remaining, setRemaining] = useState(initialMs);

  useEffect(() => {
    const deadline = Date.now() + initialMs;
    setRemaining(Math.max(0, deadline - Date.now()));

    const timer = setInterval(() => {
      setRemaining(Math.max(0, deadline - Date.now()));
    }, 1000);

    return () => clearInterval(timer);
  }, [initialMs]);

  return (
    <p className="text-muted-foreground text-xs tabular-nums">
      {t("dailyResetsIn", { time: formatDuration(remaining) })}
    </p>
  );
}

/** `HH:MM:SS`, padded so the line does not reflow every second. */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);

  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
