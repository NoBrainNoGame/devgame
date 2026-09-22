"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { TicketDialog } from "@/components/hud/TicketDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { PlayerAction, RunSnapshot, TicketView } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The project board: what is waiting, what is open, what shipped. A ticket is
 * started from here and nowhere else, because starting one is a project
 * decision, not a move in the turn.
 */
export function BoardDialog({
  open,
  onOpenChange,
  snapshot,
  busy,
  onAct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshot.tickets.find((ticket) => ticket.id === selectedId) ?? null;

  const act = (action: PlayerAction): void => {
    onAct(action);
    setSelectedId(null);
    onOpenChange(false);
  };

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
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("boardTitle")}</DialogTitle>
          <DialogDescription>
            {t("boardSubtitle", {
              sprint: snapshot.sprint,
              open: snapshot.tickets.filter((ticket) => ticket.status === "open").length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          {columns.map((column) => (
            <section key={column.key} className="min-w-0 space-y-2">
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {t(`column.${column.key}`)}
                {" "}
                <span className="tabular-nums">({column.tickets.length})</span>
              </h3>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {column.tickets.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("columnEmpty")}</p>
                ) : (
                  column.tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      current={ticket.id === snapshot.player.ticketId}
                      busy={busy}
                      onOpen={() => setSelectedId(ticket.id)}
                      onAct={act}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>

        <TicketDialog
          ticket={selected}
          snapshot={snapshot}
          busy={busy}
          onClose={() => setSelectedId(null)}
          onAct={act}
        />
      </DialogContent>
    </Dialog>
  );
}

function TicketCard({
  ticket,
  current,
  busy,
  onOpen,
  onAct,
}: {
  ticket: TicketView;
  current: boolean;
  busy: boolean;
  onOpen: () => void;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  // The card is two things: a button that opens the ticket in full, and the
  // one action the board allows on it. Two real buttons, not a clickable box
  // with a button inside — nested buttons are invalid, and a box with a role
  // does not read as one.
  return (
    <article
      className={cn(
        "space-y-2 rounded-md border border-line bg-panel/60 p-3 text-sm",
        current && "border-branch-feature",
        ticket.kind === "hotfix" && "border-branch-hotfix/60",
      )}
    >
      <button
        type="button"
        className="w-full space-y-2 rounded text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        title={t("ticketOpenHint")}
        onClick={onOpen}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("font-medium", ticket.kind === "hotfix" && "text-branch-hotfix")}>
            #{ticket.id.slice(1)} {game(`tickets.${ticket.kind}.name` as never)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("storyPointsShort", { count: ticket.points })}
          </span>
        </div>

        {ticket.skillId === undefined ? null : (
          <p className="text-branch-feature text-xs">
            {t("grants")} {game(`skills.${ticket.skillId}.name` as never)}
          </p>
        )}
        {ticket.mrr > 0 ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("ticketMrr", { money: ticket.mrr })}
          </p>
        ) : null}
        {ticket.assignee === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            {t("assignedTo", { dev: ticket.assignee })}
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
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onAct({ type: "start", ticketId: ticket.id })}
        >
          {t("startTicket")}
        </Button>
      ) : ticket.status === "open" && !current && ticket.assignee === undefined ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => onAct({ type: "checkout", ticketId: ticket.id })}
        >
          {t("checkout")}
        </Button>
      ) : null}
    </article>
  );
}
