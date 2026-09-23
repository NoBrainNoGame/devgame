"use client";

import { ChevronUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { CommitLog } from "@/components/hud/CommitLog";
import { stackLog } from "@/components/hud/logStacks";
import { useGameText } from "@/components/hud/useGameText";
import { Button } from "@/components/ui/button";
import type { LogLine } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The run's history, folded into a strip under the graph. Closed, it shows
 * the last line — enough to know what just happened. Open, a small window
 * that scrolls on its own, never more than half the canvas, with a header
 * that stays put however long the log gets: the way to close it is always
 * where it was. It is memory, not a decision, so it does not sit with the
 * actions.
 */
export function LogDrawer({ log }: { log: LogLine[] }) {
  const t = useTranslations("hud");
  const gameText = useGameText();
  const [open, setOpen] = useState(false);
  const entries = stackLog(log);
  const last = entries[entries.length - 1];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={cn(
        "absolute right-3 bottom-3 left-3 z-10 flex flex-col rounded-md border border-line bg-panel/90 backdrop-blur-sm sm:right-auto sm:w-96",
        open ? "h-[min(14rem,45%)]" : "h-9",
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 pr-1 pl-3 text-xs">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronUp className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          <span className="font-medium text-muted-foreground uppercase tracking-wider">
            {t("logTitle")}
          </span>
          {open || last === undefined ? null : (
            <span className="truncate text-muted-foreground">
              {last.kind === "stack"
                ? t("logCommitStack", { count: last.count })
                : gameText(last.line.text)}
            </span>
          )}
        </button>
        {open ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t("logClose")}
            onClick={() => setOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2">
          <CommitLog log={log} compact />
        </div>
      ) : null}
    </div>
  );
}
