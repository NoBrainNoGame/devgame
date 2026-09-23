import type { LogLine } from "@/game";

/**
 * A run of commits that all landed, with nothing between them, folded into
 * one line: "12 commits added" reads; twelve near-identical lines do not.
 * A failed roll, a review, a merge — any other line — ends the stack, and
 * so does a lone commit, which stays a line of its own.
 */
export type LogEntry =
  | { kind: "line"; line: LogLine }
  | {
      kind: "stack";
      seq: number;
      turnFrom: number;
      turnTo: number;
      count: number;
      lines: LogLine[];
    };

const LANDED = "log.node_done.";

export function stackLog(log: readonly LogLine[]): LogEntry[] {
  const entries: LogEntry[] = [];
  let run: LogLine[] = [];
  const close = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first === undefined || last === undefined) return;
    if (run.length === 1) entries.push({ kind: "line", line: first });
    else {
      entries.push({
        kind: "stack",
        seq: first.seq,
        turnFrom: first.turn,
        turnTo: last.turn,
        count: run.length,
        lines: run,
      });
    }
    run = [];
  };
  for (const line of log) {
    if (line.text.key.startsWith(LANDED)) {
      run.push(line);
      continue;
    }
    close();
    entries.push({ kind: "line", line });
  }
  close();
  return entries;
}
