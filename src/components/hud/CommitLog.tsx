"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useGameText } from "@/components/hud/useGameText";
import type { LogLine } from "@/game";
import { cn } from "@/lib/utils";

const PREFIX_COLOUR: Record<LogLine["kind"], string> = {
  feat: "text-branch-main",
  fix: "text-branch-hotfix",
  chore: "text-muted-foreground",
  merge: "text-branch-feature",
  revert: "text-debt",
  note: "text-muted-foreground",
};

/** How close to the bottom still counts as "reading the latest". */
const FOLLOW_SLACK_PX = 24;

/**
 * The run so far, written as a commit history. It is the game's memory: the
 * canvas shows where you are, this shows how you got there.
 *
 * The list scrolls itself, and only itself — `scrollIntoView` used to drag
 * every scrollable ancestor along and push the drawer's own header off the
 * screen. It follows the newest line only while you are already at the
 * bottom; a player reading back is not yanked forward by the next turn.
 */
export function CommitLog({ log, compact = false }: { log: LogLine[]; compact?: boolean }) {
  const gameText = useGameText();
  const heading = useTranslations("hud");
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lineCount = log.length;

  useEffect(() => {
    const list = listRef.current;
    if (list === null || lineCount === 0 || !atBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [lineCount]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {compact ? null : (
        <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {heading("logTitle")}
        </h2>
      )}

      <div
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          atBottomRef.current =
            list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_SLACK_PX;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 text-xs leading-relaxed"
      >
        {log.map((line) => (
          <p key={line.seq} className="whitespace-pre-wrap">
            <span className="select-none text-muted-foreground/50 tabular-nums">t{line.turn} </span>
            <span className={cn("select-none", PREFIX_COLOUR[line.kind])}>{line.kind}: </span>
            <span className="text-muted-foreground">{gameText(line.text)}</span>
          </p>
        ))}
        {log.length === 0 ? <p className="text-muted-foreground">{heading("logEmpty")}</p> : null}
      </div>
    </section>
  );
}
