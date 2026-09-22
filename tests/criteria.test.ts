import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { criteriaStatus, isReady } from "@/game/core/rules/criteria";
import { applyAction } from "@/game/core/rules/reducer";

import {
  eventsOfType,
  inHand,
  isType,
  makeReady,
  plantAiCommit,
  ticketInHand,
  withReviewSkill,
} from "./helpers";

/** The ticket in hand, asked for exactly these criteria, points already full. */
function asking(seed: string, ...criteria: ("reviewed" | "documented" | "refactored" | "clean")[]) {
  const state = makeReady(inHand(seed));
  ticketInHand(state).criteria = [...criteria].sort();
  return state;
}

describe("acceptance criteria", () => {
  test("points alone are not enough while a criterion is unmet", () => {
    const state = asking("crit-gate", "documented");
    expect(isReady(state, ticketInHand(state))).toBe(false);
    expect(getAvailableActions(state).some(isType("merge"))).toBe(false);
  });

  test("`documented` holds once a documentation commit is on the ticket", () => {
    const state = asking("crit-docs", "documented");
    state.player.energy = state.player.energyMax;

    // Write it by hand as many times as it takes to land.
    let current = state;
    for (let i = 0; i < 20; i += 1) {
      const result = applyAction(current, { type: "commit", mode: "craft", kind: "docs" });
      current = result.state;
      if (eventsOfType(result.events, "node_done").some((e) => e.kind === "docs")) break;
    }

    expect(criteriaStatus(current, ticketInHand(current))).toEqual([
      { kind: "documented", met: true },
    ]);
    expect(getAvailableActions(current).some(isType("merge"))).toBe(true);
  });

  test("`refactored` holds once a refactor commit is on the ticket", () => {
    const state = asking("crit-refactor", "refactored");
    state.player.energy = state.player.energyMax;

    let current = state;
    for (let i = 0; i < 20; i += 1) {
      const result = applyAction(current, { type: "commit", mode: "craft", kind: "refactor" });
      current = result.state;
      if (eventsOfType(result.events, "node_done").some((e) => e.kind === "refactor")) break;
    }

    expect(isReady(current, ticketInHand(current))).toBe(true);
  });

  test("`reviewed` goes away when the machine writes, and comes back when it is read", () => {
    const state = withReviewSkill(asking("crit-review", "reviewed"));
    expect(isReady(state, ticketInHand(state))).toBe(true);

    const unread = structuredClone(state);
    plantAiCommit(unread);
    expect(isReady(unread, ticketInHand(unread))).toBe(false);
    expect(getAvailableActions(unread).some(isType("merge"))).toBe(false);

    const read = applyAction(unread, { type: "review" }).state;
    expect(isReady(read, ticketInHand(read))).toBe(true);
  });

  test("`clean` reads the debt at the moment of the merge", () => {
    const state = asking("crit-clean", "clean");
    state.debt = BALANCE.criteria.cleanDebtMax + 1;
    expect(isReady(state, ticketInHand(state))).toBe(false);

    state.debt = BALANCE.criteria.cleanDebtMax;
    expect(isReady(state, ticketInHand(state))).toBe(true);
  });

  test("a ticket with no criteria merges on its points alone", () => {
    const state = asking("crit-none");
    expect(getAvailableActions(state).some(isType("merge"))).toBe(true);
  });
});
