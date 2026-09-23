import type { LogLine } from "@/game";

/**
 * A run of lines that say the same thing, with nothing between them, folded
 * into one: "12 commits added" reads, "8 tickets added" reads; twelve
 * near-identical lines do not. Any other line ends the stack, and so does
 * a lone line, which stays a line of its own.
 */
export type StackGroup = "commits" | "tickets";

export type LogEntry =
  | { kind: "line"; line: LogLine }
  | {
      kind: "stack";
      group: StackGroup;
      seq: number;
      turnFrom: number;
      turnTo: number;
      count: number;
      lines: LogLine[];
    };

/** The prefix each stack folds, and the kind its one line is rendered as. */
const STACKS: { group: StackGroup; prefix: string; kind: LogLine["kind"] }[] = [
  { group: "commits", prefix: "log.node_done.", kind: "feat" },
  { group: "tickets", prefix: "log.ticket_arrived", kind: "note" },
];

export function stackKind(group: StackGroup): LogLine["kind"] {
  return STACKS.find((s) => s.group === group)?.kind ?? "note";
}

function groupOf(line: LogLine): StackGroup | null {
  return STACKS.find((s) => line.text.key.startsWith(s.prefix))?.group ?? null;
}

export function stackLog(log: readonly LogLine[]): LogEntry[] {
  const entries: LogEntry[] = [];
  let run: LogLine[] = [];
  let group: StackGroup | null = null;
  const close = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined || group === null) return;
    if (run.length === 1) entries.push({ kind: "line", line: first });
    else {
      entries.push({
        kind: "stack",
        group,
        seq: first.seq,
        turnFrom: first.turn,
        turnTo: last.turn,
        count: run.length,
        lines: run,
      });
    }
    run = [];
    group = null;
  };
  for (const line of log) {
    const own = groupOf(line);
    if (own !== null && (group === null || group === own)) {
      run.push(line);
      group = own;
      continue;
    }
    close();
    if (own === null) entries.push({ kind: "line", line });
    else {
      run.push(line);
      group = own;
    }
  }
  close();
  return entries;
}
