"use client";

import { useTranslations } from "next-intl";

import { useActionLabel } from "@/components/multi/actionLabel";
import { Button } from "@/components/ui/button";
import { realtimeClient } from "@/realtime/client/instance";
import { useRealtime } from "@/realtime/client/store";

/**
 * The move chosen for this round, shown pending until the deadline. Nothing
 * has happened yet: it is applied when the round resolves, the same for
 * everybody. Picking another move replaces it; forgetting it is a missed round.
 */
export function PendingBar(): React.JSX.Element | null {
  const t = useTranslations("multi.pending");
  const label = useActionLabel();
  const round = useRealtime((state) => state.round);
  const question = useRealtime((state) => state.question);
  if (round === null || (question !== null && question.result === null)) return null;

  return (
    <section
      className="space-y-1 border border-time/40 bg-time/5 p-2 text-xs"
      aria-live="polite"
      data-tutorial="pending"
    >
      <h3 className="hud-title font-medium text-muted-foreground uppercase tracking-wider">
        {t("title")}
      </h3>
      {round.mine === null ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <p className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{label(round.mine)}</span>
            <Button size="xs" variant="ghost" onClick={() => realtimeClient().clearChoice()}>
              {t("cancel")}
            </Button>
          </p>
          <p className="text-muted-foreground">{t("change")}</p>
        </>
      )}
    </section>
  );
}
