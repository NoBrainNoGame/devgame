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

/**
 * The run so far, written as a commit history. It is the game's memory: the
 * canvas shows where you are, this shows how you got there.
 */
export function CommitLog({ log }: { log: LogLine[] }) {
  const gameText = useGameText();
  const heading = useTranslations("hud");
  const endRef = useRef<HTMLDivElement>(null);
  const lineCount = log.length;

  useEffect(() => {
    if (lineCount === 0) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lineCount]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {heading("logTitle")}
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-xs leading-relaxed">
        {log.map((line) => (
          <p key={line.seq} className="whitespace-pre-wrap">
            <span className={cn("select-none", PREFIX_COLOUR[line.kind])}>{line.kind}: </span>
            <span className="text-muted-foreground">{gameText(line.text)}</span>
          </p>
        ))}
        {log.length === 0 ? <p className="text-muted-foreground">{heading("logEmpty")}</p> : null}
        <div ref={endRef} />
      </div>
    </section>
  );
}
