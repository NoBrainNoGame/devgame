"use client";

import { useTranslations } from "next-intl";

import { ticketName } from "@/components/hud/ticketName";
import { useMoney } from "@/components/hud/useGameText";
import { Progress } from "@/components/ui/progress";
import type { RunSnapshot, TicketView } from "@/game";
import { labelledKind } from "@/game";
import { cn } from "@/lib/utils";

/**
 * One ticket, in full: what it asks for and gives, where it stands, who
 * holds it, what was written on it and what each commit cost. The ticket
 * dialog shows it, and so does the tooltip of a tab above the graph —
 * `compact` there, with a shorter commit list.
 */
export function TicketDetails({
  ticket,
  snapshot,
  compact = false,
  header = true,
}: {
  ticket: TicketView;
  snapshot: RunSnapshot;
  compact?: boolean;
  /** Off where the ticket's name and status already sit in a dialog's title. */
  header?: boolean;
}) {
  const t = useTranslations("hud");
  const game = useTranslations("game");
  const money = useMoney();
  const current = ticket.id === snapshot.player.ticketId;
  const dev = snapshot.devs.find((d) => d.id === ticket.assignee);
  // Features, hotfixes and refactors say what they are by their name alone.
  const hintKind =
    ticket.kind === "feature" || ticket.kind === "hotfix" || ticket.kind === "refactor"
      ? null
      : ticket.kind;

  return (
    <div className={cn("grid gap-2 text-left", compact ? "text-xs" : "gap-3 text-sm")}>
      {header ? (
        <header className="space-y-0.5">
          <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
            {ticket.parentId === undefined ? "" : "↳ "}#{ticket.id.slice(1)}{" "}
            {ticketName(game, ticket)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t(`ticketStatus.${ticket.status}`)} ·{" "}
            {t("ticketArrived", { sprint: ticket.sprintArrived })}
            {current ? ` · ${t("inHand")}` : ""}
            {dev === undefined
              ? ""
              : ` · ${t("assignedTo", { dev: dev.name })} (${game(`ranks.${dev.rank}.name` as never)})`}
          </p>
        </header>
      ) : null}

      {hintKind === null ? null : (
        <p className="text-muted-foreground text-xs">
          {game(`tickets.${hintKind}.name` as never)} · {t(`kindHint.${hintKind}`)}
        </p>
      )}
      {ticket.deadlineSprint === undefined ? null : (
        <p className="text-time text-xs">{t("deadline", { sprint: ticket.deadlineSprint })}</p>
      )}
      {ticket.late === undefined ? null : <p className="text-branch-hotfix text-xs">{t("late")}</p>}

      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">
            {t("storyPointsOf", { filled: ticket.filled, max: ticket.points })}
          </span>
          {ticket.ready ? (
            <span className="text-branch-main text-xs">
              {ticket.parentId === undefined ? t("readyToSubmit") : t("readyToLand")}
            </span>
          ) : null}
        </div>
        <Progress value={(ticket.filled / Math.max(1, ticket.points)) * 100} className="h-1.5" />
        {compact ? null : (
          <p className="text-muted-foreground text-xs leading-relaxed">{t("storyPointsHint")}</p>
        )}
        {ticket.rework > 0 ? (
          <p className="text-branch-hotfix text-xs">
            {t("ticketRework", { count: ticket.rework, rejections: ticket.rejections })}
          </p>
        ) : null}
        {ticket.mustWrite === undefined ? null : (
          <p className="text-branch-hotfix text-xs">{t(`mustWrite.${ticket.mustWrite}`)}</p>
        )}
        {ticket.mrr > 0 ? (
          <p className="text-money text-xs tabular-nums">
            {t("ticketMrr", { money: money(ticket.mrr) })}
            {ticket.origin === "acquired" ? ` · ${t("acquired")}` : ""}
          </p>
        ) : null}
        {ticket.parentId === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            {t("obstacleOn", { id: ticket.parentId.slice(1) })}
          </p>
        )}
        {ticket.blockedBy.length > 0 ? (
          <p className="text-foreground text-xs">
            {ticket.waitingOnObstacle
              ? t("waitingOnObstacle", { id: ticket.blockedBy[0]?.slice(1) ?? "" })
              : t("blockedBy", { count: ticket.blockedBy.length })}
          </p>
        ) : null}
      </section>

      {ticket.skillId === undefined ? null : (
        <section className="rounded-md border border-line bg-panel/60 p-2">
          <p className="text-foreground">
            {t("grants")} {game(`skills.${ticket.skillId}.name` as never)}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
            {game(`skills.${ticket.skillId}.desc` as never)}
          </p>
          {ticket.status === "backlog" ? (
            <p className="mt-1 text-time text-xs">{t("expiresAtSprintEnd")}</p>
          ) : null}
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
          <h3 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("ticketCommits", { count: ticket.nodeIds.length })}
          </h3>
          {ticket.nodeIds.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("ticketNoCommits")}</p>
          ) : (
            <ol
              className={cn(
                "space-y-1 overflow-y-auto pr-1 text-xs",
                compact ? "max-h-40" : "max-h-56",
              )}
            >
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
    </div>
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
