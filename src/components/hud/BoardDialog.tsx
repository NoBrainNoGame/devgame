"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { IdleBar } from "@/components/hud/IdleBar";
import { TicketDialog } from "@/components/hud/TicketDialog";
import { ticketName } from "@/components/hud/ticketName";
import { useMoney } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DevView, PlayerAction, RunSnapshot, TicketView } from "@/game";
import { cn } from "@/lib/utils";

/** Expired tickets the footer's tooltip names, newest first. */
const RECENT_EXPIRED = 8;

/**
 * The project board: what is waiting, what is open, what shipped. A ticket is
 * started from here and nowhere else, because starting one is a project
 * decision, not a move in the turn. It stays open after a decision — starting
 * a ticket is often the first of several — and closes when the player says.
 *
 * It takes most of the screen, whatever its shape: three columns that scroll
 * on their own, cards side by side where a column is wide enough. Expired
 * tickets are a count in the footer, named in its tooltip, not a column.
 */
export function BoardDialog({
  open,
  onOpenChange,
  snapshot,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const _money = useMoney();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshot.tickets.find((ticket) => ticket.id === selectedId) ?? null;

  const act = (action: PlayerAction): void => {
    onAct(action);
    setSelectedId(null);
  };

  const cancelled = snapshot.tickets.filter((ticket) => ticket.status === "cancelled").reverse();
  const columns: { key: "backlog" | "open" | "merged"; tickets: TicketView[] }[] = [
    { key: "backlog", tickets: snapshot.tickets.filter((ticket) => ticket.status === "backlog") },
    { key: "open", tickets: snapshot.tickets.filter((ticket) => ticket.status === "open") },
    {
      key: "merged",
      tickets: snapshot.tickets.filter((ticket) => ticket.status === "merged").reverse(),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(92dvh,72rem)] sm:max-w-[min(96vw,112rem)]"
        frameClassName="h-full grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <DialogHeader>
          <DialogTitle>{t("boardTitle")}</DialogTitle>
          <DialogDescription>
            {t("boardSubtitle", {
              sprint: snapshot.sprint,
              open: snapshot.tickets.filter((ticket) => ticket.status === "open").length,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Narrow: the columns stack and the body scrolls. Wider: side by side,
            each column scrolling on its own within the dialog's height. */}
        <div className="grid min-h-0 gap-3 overflow-y-auto sm:grid-cols-3 sm:overflow-visible">
          {columns.map((column) => (
            <section key={column.key} className="flex min-h-0 min-w-0 flex-col gap-2">
              <h3 className="hud-title shrink-0 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {t(`column.${column.key}`)}
                {" "}
                <span className="tabular-nums">({column.tickets.length})</span>
              </h3>
              <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start gap-2 pr-1 sm:flex-1 sm:overflow-y-auto">
                {column.tickets.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("columnEmpty")}</p>
                ) : (
                  column.tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      devs={snapshot.devs}
                      current={ticket.id === snapshot.player.ticketId}
                      onOpen={() => setSelectedId(ticket.id)}
                      onAct={act}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>

        <ExpiredFooter expired={cancelled} />

        <TicketDialog
          ticket={selected}
          snapshot={snapshot}
          onClose={() => setSelectedId(null)}
          onAct={act}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * How many offers went by unstarted — skill tickets at their sprint's end,
 * client bugs past their deadline, a groomed backlog — with the latest named
 * in a tooltip. Worth a glance, not a column.
 */
function ExpiredFooter({ expired }: { expired: TicketView[] }) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const recent = expired.slice(0, RECENT_EXPIRED);
  const more = expired.length - recent.length;
  const label = t("boardExpired", { count: expired.length });

  return (
    <footer className="flex items-center border-line border-t pt-3 text-muted-foreground text-xs">
      {expired.length === 0 ? (
        <span>{label}</span>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
            >
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-80">
            <p className="mb-1 font-medium">{t("boardExpiredRecent")}</p>
            <ul className="space-y-0.5">
              {recent.map((ticket) => (
                <li key={ticket.id}>
                  #{ticket.id.slice(1)} {ticketName(game, ticket)}
                  {ticket.skillId === undefined
                    ? ""
                    : ` · ${game(`skills.${ticket.skillId}.name` as never)}`}
                </li>
              ))}
            </ul>
            {more > 0 ? <p className="mt-1">{t("boardExpiredMore", { count: more })}</p> : null}
          </TooltipContent>
        </Tooltip>
      )}
    </footer>
  );
}

function TicketCard({
  ticket,
  devs,
  current,
  onOpen,
  onAct,
}: {
  ticket: TicketView;
  devs: DevView[];
  current: boolean;
  onOpen: () => void;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const money = useMoney();
  const game = useTranslations("game");

  // The card is two things: a button that opens the ticket in full, and the
  // one action the board allows on it. Two real buttons, not a clickable box
  // with a button inside — nested buttons are invalid, and a box with a role
  // does not read as one.
  return (
    <article
      className={cn(
        "space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm",
        // Every card looks alike: the kind is in the name, the colours are the branches'.
        current && "border-cyber",
        ticket.status === "cancelled" && "opacity-60",
      )}
    >
      <button
        type="button"
        className="w-full space-y-2 rounded text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        title={t("ticketOpenHint")}
        onClick={onOpen}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">
            #{ticket.id.slice(1)} {ticketName(game, ticket)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("storyPointsShort", { count: ticket.points })}
          </span>
        </div>

        {ticket.kind === "feature" ||
        ticket.kind === "hotfix" ||
        ticket.kind === "refactor" ? null : (
          <p className="text-muted-foreground text-xs">
            {game(`tickets.${ticket.kind}.name` as never)} · {t(`kindHint.${ticket.kind}`)}
          </p>
        )}
        {ticket.deadlineSprint === undefined ? null : (
          <p className="text-time text-xs">{t("deadline", { sprint: ticket.deadlineSprint })}</p>
        )}
        {ticket.late === undefined ? null : (
          <p className="text-branch-hotfix text-xs">{t("late")}</p>
        )}
        {ticket.skillId === undefined ? null : (
          <p className="text-foreground text-xs">
            {t("grants")} {game(`skills.${ticket.skillId}.name` as never)}
          </p>
        )}
        {ticket.skillId !== undefined && ticket.status === "backlog" ? (
          <p className="text-time text-xs">{t("expiresAtSprintEnd")}</p>
        ) : null}
        {ticket.mrr > 0 ? (
          <p className="text-money text-xs tabular-nums">
            {t("ticketMrr", { money: money(ticket.mrr) })}
            {ticket.origin === "acquired" ? ` · ${t("acquired")}` : ""}
          </p>
        ) : null}
        {ticket.assignee === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            {t("assignedTo", {
              dev: devs.find((d) => d.id === ticket.assignee)?.name ?? ticket.assignee,
            })}
          </p>
        )}

        {ticket.status === "backlog" ? null : (
          <>
            <Progress
              value={(ticket.filled / Math.max(1, ticket.points)) * 100}
              className="h-1.5"
            />
            <p className="text-muted-foreground text-xs">
              {t("storyPointsOf", { filled: ticket.filled, max: ticket.points })}
              {ticket.bugs > 0 ? ` · ${t("bugsOn", { count: ticket.bugs })}` : ""}
              {ticket.unread > 0 ? ` · ${t("unreadOn", { count: ticket.unread })}` : ""}
            </p>
          </>
        )}
      </button>

      {ticket.status === "backlog" ? (
        <div className="relative">
          <Button
            size="sm"
            className="w-full"
            onClick={() => onAct({ type: "start", ticketId: ticket.id })}
          >
            {t("startTicket")}
          </Button>
          <IdleBar action={{ type: "start", ticketId: ticket.id }} />
        </div>
      ) : ticket.status === "open" && !current && ticket.assignee === undefined ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onAct({ type: "checkout", ticketId: ticket.id })}
        >
          {t("checkout")}
        </Button>
      ) : null}
    </article>
  );
}
