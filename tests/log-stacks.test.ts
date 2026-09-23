import { describe, expect, test } from "bun:test";

import { stackLog } from "@/components/hud/logStacks";
import type { LogLine } from "@/game";

const line = (seq: number, key: string, kind: LogLine["kind"] = "feat"): LogLine => ({
  seq,
  turn: seq,
  kind,
  text: { key, params: {} },
});

describe("the log's commit stacks", () => {
  test("consecutive landed commits fold into one entry; anything else cuts the stack", () => {
    const log = [
      line(1, "log.node_done.craft"),
      line(2, "log.node_done.ai", "chore"),
      line(3, "log.node_done.craft"),
      line(4, "log.roll_failed", "revert"),
      line(5, "log.node_done.craft"),
      line(6, "log.reviewed", "note"),
      line(7, "log.node_done.craft"),
      line(8, "log.node_done.craft"),
      line(9, "log.ticket_arrived", "note"),
      line(10, "log.ticket_arrived", "note"),
      line(11, "log.ticket_arrived", "note"),
      line(12, "log.node_done.craft"),
    ];
    const entries = stackLog(log);
    expect(entries.map((e) => (e.kind === "stack" ? `stack${e.count}` : e.line.text.key))).toEqual([
      "stack3",
      "log.roll_failed",
      "log.node_done.craft",
      "log.reviewed",
      "stack2",
      "stack3",
      "log.node_done.craft",
    ]);
    expect(entries.map((e) => (e.kind === "stack" ? e.group : "-"))).toEqual([
      "commits",
      "-",
      "-",
      "-",
      "commits",
      "tickets",
      "-",
    ]);
    const first = entries[0];
    if (first?.kind === "stack") {
      expect(first.turnFrom).toBe(1);
      expect(first.turnTo).toBe(3);
      expect(first.seq).toBe(1);
    }
  });

  test("an empty log is an empty list", () => {
    expect(stackLog([])).toEqual([]);
  });
});
