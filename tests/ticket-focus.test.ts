import { describe, expect, test } from "bun:test";

import { blinks, urgencies, workingOn } from "@/components/hud/ticketFocus";

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

describe("which tabs blink", () => {
  const vip = {
    id: "t10",
    kind: "vip",
    blockedBy: ["t11"],
    waitingOnObstacle: false,
  };
  const obstacle = {
    id: "t11",
    kind: "obstacle",
    parentId: "t10",
    blockedBy: [],
    waitingOnObstacle: false,
  };
  const bug = {
    id: "t20",
    kind: "client_bug",
    deadlineSprint: 7,
    blockedBy: [],
    waitingOnObstacle: false,
  };
  const plain = { id: "t30", kind: "feature", blockedBy: [], waitingOnObstacle: false };
  const snapshot = (ticketId: string | null, tickets: readonly object[]) => ({
    tickets: tickets as never,
    player: { ticketId },
  });

  test("a VIP or a deadline nobody is on blinks; a plain feature never does", () => {
    const tickets = [vip, obstacle, bug, plain];
    const urgent = urgencies(tickets);
    expect(urgent.get("t10")).toEqual({ reason: "vip" });
    expect(urgent.get("t20")).toEqual({ reason: "deadline", sprint: 7 });
    expect(urgent.has("t30")).toBe(false);
    // The VIP still has work of its own: its obstacle is not the only thing left.
    expect(urgent.has("t11")).toBe(false);
    const at = snapshot("t30", tickets);
    expect(blinks(at, vip, urgent.get("t10"))).toBe(true);
    expect(blinks(at, bug, urgent.get("t20"))).toBe(true);
    expect(blinks(at, plain, urgent.get("t30"))).toBe(false);
  });

  test("once a VIP waits on nothing but its obstacle, the obstacle blinks in its stead", () => {
    const waiting = { ...vip, waitingOnObstacle: true };
    const tickets = [waiting, obstacle, plain];
    const urgent = urgencies(tickets);
    expect(urgent.get("t11")).toEqual({ reason: "obstacle", parentId: "t10" });

    // Elsewhere, or on the VIP itself: the obstacle is the one to pick up.
    for (const inHand of ["t30", "t10"]) {
      const at = snapshot(inHand, tickets);
      expect(blinks(at, obstacle, urgent.get("t11"))).toBe(true);
      expect(blinks(at, waiting, urgent.get("t10"))).toBe(false);
    }
    // On the obstacle: nothing blinks.
    const on = snapshot("t11", tickets);
    expect(blinks(on, obstacle, urgent.get("t11"))).toBe(false);
    expect(blinks(on, waiting, urgent.get("t10"))).toBe(false);
  });
});
