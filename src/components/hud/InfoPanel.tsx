"use client";

import { useTranslations } from "next-intl";

import { ticketName } from "@/components/hud/ticketName";
import { useMoney } from "@/components/hud/useGameText";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { RunSnapshot, TicketView } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The left column: what you are holding and what the run has become.
 *
 * It sits beside the graph so it is always on screen — the ticket in hand
 * used to live above the actions, where a long list of detours scrolled it
 * away. The panel on the right stays the turn's decision and nothing else;
 * this one is the context the decision is made in.
 */
export function InfoPanel({ snapshot }: { snapshot: RunSnapshot }) {
  const t = useTranslations("hud");
  const _money = useMoney();
  const common = useTranslations("common");
  const game = useTranslations("game");

  const current = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);
  const { player } = snapshot;

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("currentTicket")}
        </h2>
        {current === undefined ? (
          <p className="text-muted-foreground text-xs">{t("noTicket")}</p>
        ) : (
          <TicketCard ticket={current} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("runStats")}
        </h2>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{common("commits")}</dt>
          <dd className="text-right tabular-nums">{player.totalCommits}</dd>
          <dt className="text-muted-foreground">{t("delivered")}</dt>
          <dd className="text-right tabular-nums">{snapshot.ticketsDelivered}</dd>
          <dt className="text-muted-foreground">{common("score")}</dt>
          <dd className="text-right tabular-nums">{snapshot.score}</dd>
        </dl>
        {player.wip > 0 ? (
          <Badge variant="outline" className="border-branch-hotfix text-branch-hotfix">
            {t("wip", { count: player.wip })}
          </Badge>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("skillsEarned")}
        </h2>
        {snapshot.skills.length === 0 && snapshot.relics.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("nothingYet")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {snapshot.skills.map((id) => (
              <li key={id}>
                <Badge variant="secondary" title={game(`skills.${id}.desc` as never)}>
                  {game(`skills.${id}.name` as never)}
                </Badge>
              </li>
            ))}
            {snapshot.relics.map((id) => (
              <li key={id}>
                <Badge variant="outline" title={game(`relics.${id}.desc` as never)}>
                  {game(`relics.${id}.name` as never)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {snapshot.devs.length === 0 ? null : (
        <section className="space-y-2">
          <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("team")}
          </h2>
          <ul className="space-y-1 text-xs">
            {snapshot.devs.map((dev) => {
              const held = snapshot.tickets.filter((ticket) => ticket.assignee === dev.id);
              return (
                <li key={dev.id} className="flex items-baseline justify-between gap-2">
                  <span>
                    <span style={{ color: `var(--color-dev-${dev.colour})` }}>{dev.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {game(`ranks.${dev.rank}.name` as never)}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {held.map((ticket) => `#${ticket.id.slice(1)}`).join(" ") || "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The ticket in hand: what it asks for, and how far along it is. */
function TicketCard({ ticket }: { ticket: TicketView }) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");

  return (
    <div className="space-y-1.5 rounded-md border border-line bg-panel/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate", ticket.kind === "hotfix" && "text-branch-hotfix")}>
          #{ticket.id.slice(1)}{" "}
          {ticket.skillId === undefined
            ? ticketName(game, ticket)
            : game(`skills.${ticket.skillId}.name` as never)}
        </span>
        <span className="shrink-0 text-xs tabular-nums">
          {ticket.filled}/{ticket.points}
        </span>
      </div>
      <Progress value={(ticket.filled / Math.max(1, ticket.points)) * 100} className="h-1.5" />
      {ticket.mustWrite === undefined ? null : (
        <p className="text-branch-hotfix text-xs">{t(`mustWrite.${ticket.mustWrite}`)}</p>
      )}
      {ticket.mrr > 0 ? (
        <p className="text-muted-foreground text-xs tabular-nums">
          {t("ticketMrr", { money: money(ticket.mrr) })}
        </p>
      ) : null}
      {ticket.unread > 0 ? (
        <p className="text-debt text-xs">{t("unreadOn", { count: ticket.unread })}</p>
      ) : null}
      {ticket.bugs > 0 ? (
        <p className="text-branch-hotfix text-xs">{t("bugsOn", { count: ticket.bugs })}</p>
      ) : null}
      {ticket.behind > 0 ? (
        <p className="text-muted-foreground text-xs">{t("behindDev", { count: ticket.behind })}</p>
      ) : null}
      {ticket.ready ? <p className="text-branch-main text-xs">{t("readyToSubmit")}</p> : null}
    </div>
  );
}
