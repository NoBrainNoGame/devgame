"use client";

import { useTranslations } from "next-intl";

import { useGameStore } from "@/game";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/realtime/client/store";

/** The people of this player's site: who they are, what is left in their tank, what they hold. */
export function TeamMates(): React.JSX.Element | null {
  const t = useTranslations("multi.team");
  const crew = useGameStore((state) => state.snapshot?.crew);
  const members = useRealtime((state) => state.members);
  if (crew === undefined) return null;

  const here = crew.seats.filter((seat) => seat.site === crew.mySite);
  const elsewhere = crew.seats.length - here.length;

  return (
    <section className="space-y-2">
      <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {t("title")}
      </h3>
      <ul className="space-y-1.5 text-xs">
        {here.map((seat) => {
          const status = members.find((member) => member.seat === seat.seat)?.status ?? "online";
          return (
            <li key={seat.seat} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-dev-${seat.colour})` }}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  seat.seat === crew.mySeat && "font-medium",
                )}
              >
                {seat.name}
                {seat.seat === crew.mySeat ? ` (${t("me")})` : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">
                ⚡ {t("energy", { energy: seat.energy, max: seat.energyMax })}
              </span>
              <span className="w-12 truncate text-right text-muted-foreground">
                {seat.ticketId === null ? t("noTicket") : seat.ticketId}
              </span>
              <span
                className={cn(
                  "w-16 text-right",
                  status === "online" ? "text-muted-foreground" : "text-debt",
                )}
              >
                {seat.pending === undefined
                  ? t(`status.${status}` as never)
                  : t(`pending.${seat.pending}` as never)}
              </span>
            </li>
          );
        })}
      </ul>
      {elsewhere > 0 ? (
        <p className="text-muted-foreground text-xs">{t("otherSites", { count: elsewhere })}</p>
      ) : null}
    </section>
  );
}
