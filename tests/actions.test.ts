import { describe, expect, test } from "bun:test";

import { getAvailableActions, isActionAvailable } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { InvalidActionError } from "@/game/core/types";

import { findSeed, inHand, isType, makeReady, makeReviewable, newRun, policy } from "./helpers";

describe("getAvailableActions", () => {
  test("a fresh run has a backlog to start from and nothing in hand", () => {
    const state = newRun("actions-1");
    expect(state.phase.kind).toBe("choose_action");
    expect(state.player.ticketId).toBeNull();

    const types = getAvailableActions(state).map((a) => a.type);
    expect(types).toContain("start");
    expect(types).not.toContain("commit");
    expect(types).not.toContain("submit");
  });

  test("a ticket in hand offers both commits and the detours, never a submit yet", () => {
    const state = inHand("actions-2");
    const actions = getAvailableActions(state);

    expect(actions.some((a) => a.type === "commit" && a.mode === "craft")).toBe(true);
    expect(actions.some((a) => a.type === "commit" && a.mode === "ai")).toBe(true);
    expect(actions.some((a) => a.type === "commit" && a.kind === "docs")).toBe(true);
    expect(actions.some(isType("submit"))).toBe(false);
    // Nothing has landed on `dev` since it was opened: nothing to rebase onto.
    expect(actions.some((a) => a.type === "commit" && a.kind === "rebase")).toBe(false);
  });

  test("a run that has learned to review is offered it, once there is something to read", () => {
    const state = inHand("actions-2");
    const ready = makeReviewable(state);

    expect(getAvailableActions(state).some(isType("review"))).toBe(false);
    expect(getAvailableActions(ready).some(isType("review"))).toBe(true);
  });

  test("submitting is offered exactly when the points are full", () => {
    const state = inHand("actions-merge");
    expect(getAvailableActions(state).some(isType("submit"))).toBe(false);
    expect(getAvailableActions(makeReady(state)).some(isType("submit"))).toBe(true);
  });

  test("a commit is legal even with no energy left to pay for it", () => {
    const state = inHand("actions-3");
    const broke = structuredClone(state);
    broke.player.energy = 0;

    expect(isActionAvailable(broke, { type: "commit", mode: "craft" })).toBe(true);
  });

  test("starting a ticket that is not in the backlog is refused", () => {
    const state = newRun("actions-4");
    expect(() => applyAction(state, { type: "start", ticketId: "t999" })).toThrow(
      InvalidActionError,
    );
  });

  test("committing with nothing in hand is refused", () => {
    const state = newRun("actions-5");
    expect(() => applyAction(state, { type: "commit", mode: "ai" })).toThrow(InvalidActionError);
  });

  test("switching to the ticket already in hand is not an option", () => {
    const state = inHand("actions-checkout");
    const mine = state.player.ticketId;
    expect(mine).not.toBeNull();
    expect(
      getAvailableActions(state).some((a) => a.type === "checkout" && a.ticketId === mine),
    ).toBe(false);
  });

  test("a merge conflict offers exactly the two ways out", () => {
    const { state } = findSeed((result) => result.state.phase.kind === "resolve_conflict", {
      prefix: "conflict",
      pick: policy("ai"),
      limit: 120,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });

    const actions = getAvailableActions(state);
    expect(actions.map((a) => (a.type === "resolve_conflict" ? a.how : a.type)).sort()).toEqual([
      "ai",
      "manual",
    ]);
  });

  test("a finished run accepts nothing", () => {
    const { state } = findSeed((result) => result.state.phase.kind === "game_over", {
      prefix: "over",
      pick: policy("ai"),
      limit: 600,
    });

    expect(getAvailableActions(state)).toEqual([]);
    expect(() => applyAction(state, { type: "review" })).toThrow(InvalidActionError);
  });

  test("DevOps points only appear once they can be spent", () => {
    const state = inHand("actions-6");
    expect(getAvailableActions(state).some(isType("devops"))).toBe(false);

    const rich = structuredClone(state);
    rich.devopsPoints = 5;
    expect(getAvailableActions(rich).some(isType("devops"))).toBe(true);
  });

  test("a maxed DevOps node stops being offered", () => {
    const state = inHand("actions-7");
    const maxed = structuredClone(state);
    maxed.devopsPoints = 9;
    maxed.devops.cd = 1;

    const offered = getAvailableActions(maxed)
      .filter(isType("devops"))
      .map((a) => (a.type === "devops" ? a.id : ""));
    expect(offered).not.toContain("cd");
    expect(offered).toContain("ci");
  });
});
