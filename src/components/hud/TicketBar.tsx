"use client";

import { KanbanSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlayerAction, RunSnapshot, TicketView } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The tickets you are holding, as tabs above the graph. The one in hand is
 * lit; clicking another checks it out. Switching is free, so it lives where a
 * free thing belongs — beside the work, not among the actions that cost a
 * turn.
 */
export function TicketBar({
  snapshot,
  busy,
  onAct,
  onOpenBoard,
}: {
  snapshot: RunSnapshot;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
  onOpenBoard: () => void;
}) {
  const t = useTranslations("hud");
  const open = snapshot.tickets.filter((ticket) => ticket.status === "open");
  const waiting = snapshot.tickets.filter((ticket) => ticket.status === "backlog").length;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-line border-b bg-panel/40 px-3 py-2">
      <Button
        size="sm"
        variant={open.length === 0 ? "default" : "outline"}
        className="shrink-0"
        onClick={onOpenBoard}
      >
        <KanbanSquare className="size-4" />
        {t("board")}
        {waiting > 0 ? (
          <span className="rounded-full bg-branch-feature/20 px-1.5 text-branch-feature text-xs tabular-nums">
            {waiting}
          </span>
        ) : null}
      </Button>

      {open.length === 0 ? (
        <span className="text-muted-foreground text-sm">{t("noTicket")}</span>
      ) : (
        open.map((ticket) => (
          <TicketTab
            key={ticket.id}
            ticket={ticket}
            current={ticket.id === snapshot.player.ticketId}
            busy={busy}
            onAct={onAct}
          />
        ))
      )}
    </div>
  );
}

function TicketTab({
  ticket,
  current,
  busy,
  onAct,
}: {
  ticket: TicketView;
  current: boolean;
  busy: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const name =
    ticket.skillId === undefined
      ? game(`tickets.${ticket.kind}.name` as never)
      : game(`skills.${ticket.skillId}.name` as never);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={busy || current}
          onClick={() => onAct({ type: "checkout", ticketId: ticket.id })}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
            current
              ? "border-branch-feature bg-branch-feature/10 text-foreground"
              : "border-line text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            ticket.kind === "hotfix" && "border-branch-hotfix/60",
            ticket.ready && "border-branch-main",
          )}
        >
          <span className="tabular-nums text-xs opacity-70">#{ticket.id.slice(1)}</span>
          <span
            className={cn("max-w-40 truncate", ticket.kind === "hotfix" && "text-branch-hotfix")}
          >
            {name}
          </span>
          <span className="tabular-nums text-xs">
            {ticket.filled}/{ticket.points}
          </span>
          {ticket.unread > 0 ? (
            <span className="rounded-full bg-debt/20 px-1.5 text-debt text-xs tabular-nums">
              {ticket.unread}
            </span>
          ) : null}
          {ticket.ready ? <span className="text-branch-main text-xs">✓</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        <p>{t("storyPointsOf", { filled: ticket.filled, max: ticket.points })}</p>
        {ticket.unread > 0 ? (
          <p className="text-debt">{t("unreadOn", { count: ticket.unread })}</p>
        ) : null}
        {ticket.behind > 0 ? (
          <p className="text-muted-foreground">{t("behindDev", { count: ticket.behind })}</p>
        ) : null}
        {ticket.ready ? (
          <p className="text-branch-main">{t("readyToSubmit")}</p>
        ) : (
          <p className="text-muted-foreground">{current ? t("inHand") : t("clickToSwitch")}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
