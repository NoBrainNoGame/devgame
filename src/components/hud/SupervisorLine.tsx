"use client";

import { useTranslations } from "next-intl";

import { chooseSupervisor, type RunSnapshot } from "@/game";

/**
 * What the supervisor is about to do, said before the clock presses it. The
 * move is the same one the idle bar points at; this is its reason, in words.
 */
export function SupervisorLine({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  if (snapshot.autopilot <= 0 || snapshot.phase.kind !== "choose_action") return null;
  const move = chooseSupervisor(snapshot);
  if (move === undefined) return null;

  return (
    <p className="text-muted-foreground text-xs">
      {t("supervisorWill", { level: snapshot.autopilot, move: t(`supervisorMove.${move.reason}`) })}
    </p>
  );
}
