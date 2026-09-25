import { describe, expect, test } from "bun:test";

import { blinkingTabs, type FocusTicket, urgencies, workingOn } from "@/components/hud/ticketFocus";

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
  const vip = { id: "t10", kind: "vip", blockedBy: ["t11"], waitingOnObstacle: false };
  const obstacle = {
    id: "t11",
    kind: "obstacle",
    parentId: "t10",
    blockedBy: [],
    waitingOnObstacle: false,
  };
  const otherVip = { id: "t12", kind: "vip", blockedBy: [], waitingOnObstacle: false };
  const bug = {
    id: "t20",
    kind: "client_bug",
    deadlineSprint: 7,
    blockedBy: [],
    waitingOnObstacle: false,
  };
  const plain = { id: "t30", kind: "feature", blockedBy: [], waitingOnObstacle: false };
  const at = (ticketId: string | null, tickets: readonly object[]) => ({
    tickets: tickets as never,
    player: { ticketId },
  });
  const blinking = (ticketId: string | null, tickets: readonly FocusTicket[]): string[] =>
    [...blinkingTabs(at(ticketId, tickets), tickets).keys()].sort();

  test("on a plain ticket, every VIP and deadline blinks; a plain feature never does", () => {
    const tickets = [vip, obstacle, bug, plain];
    expect(blinking("t30", tickets)).toEqual(["t10", "t20"]);
    expect(blinkingTabs(at("t30", tickets), tickets).get("t20")).toEqual({
      reason: "deadline",
      sprint: 7,
    });
    // The VIP still has work of its own: its obstacle is not the only thing left.
    expect(urgencies(tickets).has("t11")).toBe(false);
  });

  test("on one urgent ticket, or one of its subs, nothing else blinks", () => {
    const tickets = [vip, obstacle, otherVip, bug, plain];
    expect(blinking("t10", tickets)).toEqual([]);
    expect(blinking("t11", tickets)).toEqual([]);
    expect(blinking("t12", tickets)).toEqual([]);
    expect(blinking("t30", tickets)).toEqual(["t10", "t12", "t20"]);
  });

  test("once a VIP waits on nothing but its obstacle, the obstacle blinks in its stead", () => {
    const waiting = { ...vip, waitingOnObstacle: true };
    const tickets = [waiting, obstacle, plain];
    expect(urgencies(tickets).get("t11")).toEqual({ reason: "obstacle", parentId: "t10" });
    // Elsewhere, or on the VIP itself: the obstacle is the one to pick up.
    expect(blinking("t30", tickets)).toEqual(["t11"]);
    expect(blinking("t10", tickets)).toEqual(["t11"]);
    // On the obstacle: nothing left to point at.
    expect(blinking("t11", tickets)).toEqual([]);
    // Another VIP in hand: this one's obstacle holds still too.
    expect(blinking("t12", [...tickets, otherVip])).toEqual([]);
  });
});
