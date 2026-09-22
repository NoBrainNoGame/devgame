"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { CommitLog } from "@/components/hud/CommitLog";
import { useGameText } from "@/components/hud/useGameText";
import type { LogLine } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The run's history, folded into a strip under the graph. Closed, it shows
 * the last line — enough to know what just happened. Open, the whole log.
 * It is memory, not a decision, so it does not sit with the actions.
 */
export function LogDrawer({ log }: { log: LogLine[] }) {
  const t = useTranslations("hud");
  const gameText = useGameText();
  const [open, setOpen] = useState(false);
  const last = log[log.length - 1];

  return (
    <div
      className={cn(
        "absolute right-3 bottom-3 left-3 z-10 flex flex-col rounded-md border border-line bg-panel/90 backdrop-blur-sm sm:right-auto sm:w-96",
        open ? "h-56" : "h-9",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 shrink-0 items-center gap-2 px-3 text-left text-xs"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        <span className="font-medium text-muted-foreground uppercase tracking-wider">
          {t("logTitle")}
        </span>
        {open || last === undefined ? null : (
          <span className="truncate text-muted-foreground">{gameText(last.text)}</span>
        )}
      </button>
      {open ? (
        <div className="min-h-0 flex-1 px-3 pb-2">
          <CommitLog log={log} compact />
        </div>
      ) : null}
    </div>
  );
}
