"use client";

import { useTranslations } from "next-intl";

import { useGameStore } from "@/game";
import { useRealtime } from "@/realtime/client/store";

/** Says when the supervisor is playing a seat: this player's, or a colleague's. */
export function AutopilotLine(): React.JSX.Element | null {
  const t = useTranslations("multi.autopilot");
  const crew = useGameStore((state) => state.snapshot?.crew);
  const members = useRealtime((state) => state.members);
  if (crew === undefined) return null;

  const mineOnMachine = members.some(
    (member) => member.seat === crew.mySeat && member.status === "autopilot",
  );
  const others = members
    .filter((member) => member.seat !== crew.mySeat && member.status === "autopilot")
    .map((member) => member.name);

  if (!mineOnMachine && others.length === 0) return null;
  return (
    <div className="space-y-1 text-xs">
      {mineOnMachine ? <p className="text-debt">{t("line")}</p> : null}
      {others.length === 0 ? null : (
        <p className="text-muted-foreground">{t("others", { names: others.join(", ") })}</p>
      )}
    </div>
  );
}
