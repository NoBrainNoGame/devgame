import { describe, expect, test } from "bun:test";

import { workingOn } from "@/components/hud/ticketFocus";

const tickets = [
  { id: "t1", parentId: undefined },
  { id: "t2", parentId: "t1" },
  { id: "t3", parentId: "t2" },
  { id: "t4", parentId: undefined },
] as const;

function at(ticketId: string | null) {
  return { tickets: tickets as never, player: { ticketId } };
}

describe("working on a ticket", () => {
  test("holding it, or any sub it turned up, is working on it", () => {
    expect(workingOn(at("t1"), "t1")).toBe(true);
    expect(workingOn(at("t2"), "t1")).toBe(true);
    // An obstacle's own obstacle still serves the feature above both.
    expect(workingOn(at("t3"), "t1")).toBe(true);
  });

  test("another ticket, a parent, or nothing in hand is not", () => {
    expect(workingOn(at("t4"), "t1")).toBe(false);
    expect(workingOn(at("t1"), "t2")).toBe(false);
    expect(workingOn(at(null), "t1")).toBe(false);
  });
});
