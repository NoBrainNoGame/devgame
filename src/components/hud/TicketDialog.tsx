"use client";

import { useTranslations } from "next-intl";

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
import { labelledKind } from "@/game";
import { cn } from "@/lib/utils";

/**
 * One ticket, in full: what it asks for, what it gives, what has been written
 * on it and what each of those commits is worth or costs. Opened from a card
 * on the board; the card itself only has room for the headline.
 */
export function TicketDialog({
  ticket,
  snapshot,
  busy,
  onClose,
  onAct,
}: {
  ticket: TicketView | null;
  snapshot: RunSnapshot;
  busy: boolean;
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
          <DialogTitle className={cn(ticket.kind === "hotfix" && "text-branch-hotfix")}>
            #{ticket.id.slice(1)} {game(`tickets.${ticket.kind}.name` as never)}
          </DialogTitle>
          <DialogDescription>
            {t(`ticketStatus.${ticket.status}`)} ·{" "}
            {t("ticketArrived", { sprint: ticket.sprintArrived })}
            {current ? ` · ${t("inHand")}` : ""}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {t("storyPointsOf", { filled: ticket.filled, max: ticket.points })}
            </span>
            {ticket.ready ? (
              <span className="text-branch-feature text-xs">{t("readyToSubmit")}</span>
            ) : null}
          </div>
          <Progress value={(ticket.filled / Math.max(1, ticket.points)) * 100} className="h-1.5" />
          <p className="text-muted-foreground text-xs leading-relaxed">{t("storyPointsHint")}</p>
          {ticket.rework > 0 ? (
            <p className="text-branch-hotfix text-xs">
              {t("ticketRework", { count: ticket.rework, rejections: ticket.rejections })}
            </p>
          ) : null}
          {ticket.mustWrite === undefined ? null : (
            <p className="text-branch-hotfix text-xs">{t(`mustWrite.${ticket.mustWrite}`)}</p>
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
        </section>

        {ticket.skillId === undefined ? null : (
          <section className="rounded-md border border-branch-feature/40 bg-branch-feature/5 p-3 text-sm">
            <p className="text-branch-feature">
              {t("grants")} {game(`skills.${ticket.skillId}.name` as never)}
            </p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              {game(`skills.${ticket.skillId}.desc` as never)}
            </p>
          </section>
        )}

        {ticket.status === "backlog" ? null : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Stat label={t("commits")} value={String(ticket.commits)} />
            <Stat
              label={t("ticketDebtLabel")}
              value={t("ticketDebtAdded", { debt: ticket.debtAdded })}
              tone={ticket.debtAdded > 0 ? "text-debt" : undefined}
            />
            <Stat
              label={t("ticketBugsLabel")}
              value={String(ticket.bugs)}
              tone={ticket.bugs > 0 ? "text-branch-hotfix" : undefined}
            />
            <Stat
              label={t("ticketUnreadLabel")}
              value={String(ticket.unread)}
              tone={ticket.unread > 0 ? "text-debt" : undefined}
            />
            {ticket.behind > 0 ? (
              <Stat
                label={t("ticketBehindLabel")}
                value={t("behindDev", { count: ticket.behind })}
                tone="text-debt"
              />
            ) : null}
          </dl>
        )}

        {ticket.status === "backlog" ? null : (
          <section className="space-y-1">
            <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {t("ticketCommits", { count: ticket.nodeIds.length })}
            </h3>
            {ticket.nodeIds.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("ticketNoCommits")}</p>
            ) : (
              <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
                {ticket.nodeIds.map((id, index) => {
                  const node = snapshot.nodes[id];
                  if (node === undefined) return null;
                  const kind = labelledKind(node.kind);
                  const unread = node.commit.mode === "ai" && !node.commit.reviewed;
                  return (
                    <li
                      key={id}
                      className={cn(
                        "flex items-baseline gap-2 rounded border border-line/60 px-2 py-1",
                        node.commit.bugged === true && "border-branch-hotfix/60",
                      )}
                    >
                      <span className="w-5 shrink-0 text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {game(`nodes.${kind}.name` as never)}
                        <span className="text-muted-foreground">
                          {" · "}
                          {node.commit.mode === "ai" ? t("tooltipByMachine") : t("tooltipByHand")}
                        </span>
                      </span>
                      {node.commit.bugged === true ? (
                        <span className="text-branch-hotfix">{t("ticketBugged")}</span>
                      ) : unread ? (
                        <span className="text-debt">{t("tooltipUnread")}</span>
                      ) : null}
                      {node.commit.debt === undefined ? null : (
                        <span className="text-debt tabular-nums">
                          {t("ticketCost", { debt: node.commit.debt })}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {ticket.status === "backlog" ? (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => onAct({ type: "start", ticketId: ticket.id })}
          >
            {t("startTicket")}
          </Button>
        ) : ticket.status === "open" && !current ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => onAct({ type: "checkout", ticketId: ticket.id })}
          >
            {t("checkout")}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2 border-line/60 border-b py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
