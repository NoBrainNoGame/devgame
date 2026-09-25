"use client";

import { useTranslations } from "next-intl";

import { TicketDetails } from "@/components/hud/TicketDetails";
import { ticketName } from "@/components/hud/ticketName";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerAction, RunSnapshot, TicketView } from "@/game";

/**
 * One ticket, in full (`TicketDetails`), with the one move the board allows
 * on it. Opened from a card on the board; the card itself only has room for
 * the headline.
 */
export function TicketDialog({
  ticket,
  snapshot,
  onClose,
  onAct,
}: {
  ticket: TicketView | null;
  snapshot: RunSnapshot;
  onClose: () => void;
  onAct: (action: PlayerAction) => void;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");

  if (ticket === null) return null;
  const current = ticket.id === snapshot.player.ticketId;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            #{ticket.id.slice(1)} {ticketName(game, ticket)}
          </DialogTitle>
          <DialogDescription>
            {t(`ticketStatus.${ticket.status}`)} ·{" "}
            {t("ticketArrived", { sprint: ticket.sprintArrived })}
            {current ? ` · ${t("inHand")}` : ""}
          </DialogDescription>
        </DialogHeader>

        <TicketDetails ticket={ticket} snapshot={snapshot} header={false} />

        {ticket.status === "backlog" ? (
          <Button className="w-full" onClick={() => onAct({ type: "start", ticketId: ticket.id })}>
            {t("startTicket")}
          </Button>
        ) : ticket.status === "open" && !current ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onAct({ type: "checkout", ticketId: ticket.id })}
          >
            {t("checkout")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
