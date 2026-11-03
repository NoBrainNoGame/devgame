"use client";

import { useTranslations } from "next-intl";

import { useCountdown } from "@/components/multi/useCountdown";
import { useGameStore } from "@/game";
import { CREW_BALANCE } from "@/game/core/balance";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/realtime/client/store";

/**
 * The round, always in view: the seconds left, a bar draining, a dot per
 * human of the company in their colour (filled once they have sent their
 * move, never what the move is), and what this player is up to.
 */
export function RoundBar(): React.JSX.Element | null {
  const t = useTranslations("multi.round");
  const round = useRealtime((state) => state.round);
  const question = useRealtime((state) => state.question);
  const resolved = useRealtime((state) => state.resolved);
  const members = useRealtime((state) => state.members);
  const roundSeconds = useRealtime((state) => state.roundSeconds);
  const crew = useGameStore((state) => state.snapshot?.crew);
  const deciding = question !== null && question.result === null;
  const seconds = useCountdown(deciding ? question.deadline : (round?.deadline ?? null));
  if (crew === undefined) return null;

  const me = members.find((member) => member.seat === crew.mySeat);
  const misses = resolved?.misses[String(crew.mySeat)] ?? 0;
  const left = seconds ?? 0;
  const share = Math.min(1, left / roundSeconds);

  const state =
    me?.status === "autopilot"
      ? t("autopilot")
      : deciding
        ? t("deciding")
        : round === null
          ? t("noRound")
          : round.mine !== null
            ? t("sent")
            : t("waiting");

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-line border-b bg-panel/60 px-3 py-1.5 text-xs"
      data-tutorial="round"
    >
      <span className="font-display font-semibold uppercase tracking-[0.12em] text-cyber">
        {t("label", { round: round?.round ?? 0 })}
      </span>
      <span className="tabular-nums text-foreground" aria-live="off">
        {seconds === null ? "—" : t("seconds", { seconds: left })}
      </span>
      <span className="relative h-1 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
        <span
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-200 ease-linear",
            left <= 5 ? "bg-debt" : "bg-time",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <ul className="flex items-center gap-1">
        {crew.seats.map((seat) => {
          const sent = round?.sent.includes(seat.seat) === true;
          const name = members.find((member) => member.seat === seat.seat)?.name ?? seat.name;
          return (
            <li
              key={seat.seat}
              title={t(sent ? "seatSent" : "seatWaiting", { name })}
              className={cn(
                "size-2.5 rounded-full border transition-colors",
                seat.seat === crew.mySeat &&
                  "ring-1 ring-foreground/60 ring-offset-1 ring-offset-bg",
              )}
              style={{
                borderColor: `var(--color-dev-${seat.colour})`,
                backgroundColor: sent ? `var(--color-dev-${seat.colour})` : "transparent",
              }}
            />
          );
        })}
      </ul>
      <span className="text-muted-foreground">{state}</span>
      {misses > 0 && me?.status !== "autopilot" ? (
        <span className="text-debt">
          {t("missed", { count: misses, max: CREW_BALANCE.crew.missesBeforeAutopilot })}
        </span>
      ) : null}
    </div>
  );
}
