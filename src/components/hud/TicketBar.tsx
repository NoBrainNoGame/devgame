"use client";

import { KanbanSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { TicketDetails } from "@/components/hud/TicketDetails";
import { workingOn } from "@/components/hud/ticketFocus";
import { ticketName } from "@/components/hud/ticketName";
import { useShownFilled } from "@/components/hud/useShownGauges";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlayerAction, RunSnapshot, TicketView } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The tickets you are holding, as tabs above the graph. The one in hand is
 * lit; clicking another checks it out. Switching is free, so it lives where a
 * free thing belongs — beside the work, not among the actions that cost a
 * turn. Hovering any tab, yours or the team's, shows the whole ticket; a VIP
 * of yours that nobody is working on blinks until you pick it up.
 */
export function TicketBar({
  snapshot,
  onAct,
  onOpenBoard,
}: {
  snapshot: RunSnapshot;
  onAct: (action: PlayerAction) => void;
  onOpenBoard: () => void;
}) {
  const t = useTranslations("hud");
  const open = snapshot.tickets.filter(
    (ticket) => ticket.status === "open" && ticket.assignee === undefined,
  );
  const team = snapshot.tickets.filter(
    (ticket) => ticket.status === "open" && ticket.assignee !== undefined,
  );
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
          <span className="rounded-full bg-cyber/15 px-1.5 text-cyber text-xs tabular-nums">
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
            snapshot={snapshot}
            current={ticket.id === snapshot.player.ticketId}
            onAct={onAct}
          />
        ))
      )}

      {team.length === 0 ? null : (
        <div className="ml-auto flex shrink-0 items-center gap-2 border-line border-l pl-3">
          <span className="text-muted-foreground text-xs">{t("team")}</span>
          {team.map((ticket) => {
            const dev = snapshot.devs.find((d) => d.id === ticket.assignee);
            return (
              <Tooltip key={ticket.id}>
                <TooltipTrigger asChild>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line/60 border-dashed px-2 py-1 text-muted-foreground text-xs">
                    {dev === undefined ? null : (
                      <span
                        className="font-medium"
                        style={{ color: `var(--color-dev-${dev.colour})` }}
                      >
                        {dev.name}
                      </span>
                    )}
                    <span className="tabular-nums opacity-70">
                      {ticket.parentId === undefined ? "" : "↳"}#{ticket.id.slice(1)}
                    </span>
                    <ShownPoints ticket={ticket} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className={DETAILS_TOOLTIP}>
                  <TicketDetails ticket={ticket} snapshot={snapshot} compact />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A tooltip wide enough for a whole ticket, and hoverable so its commit list scrolls. */
const DETAILS_TOOLTIP = "w-[22rem] max-w-[calc(100vw-2rem)] items-stretch";

function TicketTab({
  ticket,
  snapshot,
  current,
  onAct,
}: {
  ticket: TicketView;
  snapshot: RunSnapshot;
  current: boolean;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const name =
    ticket.skillId === undefined
      ? ticketName(game, ticket)
      : game(`skills.${ticket.skillId}.name` as never);
  // Double revenue and a deadline, and nobody on it — not even on one of its
  // obstacles: it asks to be picked up.
  const vipWaiting = ticket.kind === "vip" && !workingOn(snapshot, ticket.id);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // Not `disabled`: a disabled button takes no hover, and the tab in
          // hand is the one whose tooltip matters most. Never blocked by an
          // animation either: acting cuts the story short (`PlayClient.act`).
          aria-disabled={current}
          onClick={() => {
            if (!current) onAct({ type: "checkout", ticketId: ticket.id });
          }}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
            vipWaiting && "ticket-vip-waiting",
            // Every ticket looks alike: the kind is in the name, the colours are the branches'.
            current
              ? "border-cyber bg-cyber/10 text-foreground"
              : "border-line text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            ticket.ready && "border-cyber",
          )}
        >
          <span className="tabular-nums text-xs opacity-70">
            {ticket.parentId === undefined ? "" : "↳"}#{ticket.id.slice(1)}
          </span>
          <span className="max-w-40 truncate">{name}</span>
          <ShownPoints ticket={ticket} className="text-xs" />
          {ticket.blockedBy.length > 0 ? (
            <span className="rounded-full bg-muted px-1.5 text-foreground text-xs tabular-nums">
              ⛔ {ticket.blockedBy.length}
            </span>
          ) : null}
          {ticket.bugs > 0 ? (
            <span className="rounded-full bg-branch-hotfix/20 px-1.5 text-branch-hotfix text-xs tabular-nums">
              {ticket.bugs}
            </span>
          ) : ticket.unread > 0 ? (
            <span className="rounded-full bg-debt/20 px-1.5 text-debt text-xs tabular-nums">
              {ticket.unread}
            </span>
          ) : null}
          {ticket.ready ? <span className="text-cyber text-xs">✓</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className={DETAILS_TOOLTIP}>
        <TicketDetails ticket={ticket} snapshot={snapshot} compact />
        {current && !vipWaiting ? null : (
          <p className={cn("text-xs", vipWaiting ? "text-cyber" : "text-muted-foreground")}>
            {vipWaiting ? `${t("vipWaiting")} ` : ""}
            {current ? "" : t("clickToSwitch")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** A ticket's points on its tab, held until the canvas shows them rise; the balls land here. */
function ShownPoints({
  ticket,
  className,
}: {
  ticket: { id: string; filled: number; points: number };
  className?: string;
}) {
  const filled = useShownFilled(ticket);
  return (
    <span data-gauge={`points:${ticket.id}`} className={cn("tabular-nums", className)}>
      {filled}/{ticket.points}
    </span>
  );
}
