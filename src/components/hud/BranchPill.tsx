import type { TicketView } from "@/game";
import { TICKET_KIND } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * A ticket's branch, the way the canvas names it at the tip of its column
 * (`chips/BranchRefs.ts`: `feat/t7`, in the column's colour). The same pill
 * in the DOM, so a tab and a branch on the graph read as one thing.
 */
export function BranchPill({ ticket, className }: { ticket: TicketView; className?: string }) {
  const kind = TICKET_KIND[ticket.kind];
  const colour = `var(--color-branch-${kind.colour})`;
  return (
    <span
      className={cn(
        "shrink-0 rounded border bg-bg/95 px-1.5 font-mono text-[0.65rem] leading-4",
        className,
      )}
      style={{ color: colour, borderColor: colour }}
    >
      {kind.refPrefix}/{ticket.id}
    </span>
  );
}
