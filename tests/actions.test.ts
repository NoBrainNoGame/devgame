import { describe, expect, test } from "bun:test";

import { getAvailableActions, isActionAvailable } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { InvalidActionError } from "@/game/core/types";

import { findSeed, isCommit, isType, makeReviewable, newRun, play, prefer } from "./helpers";

describe("getAvailableActions", () => {
  test("a fresh run starts by choosing where to go", () => {
    const state = newRun("actions-1");
    expect(state.phase.kind).toBe("choose_node");
    expect(getAvailableActions(state).every((a) => a.type === "move" || a.type === "devops")).toBe(
      true,
    );
  });

  test("standing on a node offers both commits, and no move", () => {
    const { state } = play(newRun("actions-2"), { limit: 1 });
    expect(state.phase.kind).toBe("choose_action");

    const types = getAvailableActions(state).map((a) => a.type);
    expect(types).toContain("commit");
    expect(types).not.toContain("move");
  });

  test("a run that has learned to review is offered it, once there is something to read", () => {
    const { state } = play(newRun("actions-2"), { limit: 1 });
    const ready = makeReviewable(state);

    expect(getAvailableActions(state).some(isType("review"))).toBe(false);
    expect(getAvailableActions(ready).some(isType("review"))).toBe(true);
  });

  test("a commit is legal even with no energy left to pay for it", () => {
    const { state } = play(newRun("actions-3"), { limit: 1 });
    const broke = structuredClone(state);
    broke.player.energy = 0;

    expect(isActionAvailable(broke, { type: "commit", mode: "craft" })).toBe(true);
  });

  test("moving to a node that is not a candidate is refused", () => {
    const state = newRun("actions-4");
    expect(() => applyAction(state, { type: "move", nodeId: "1:999" })).toThrow(InvalidActionError);
  });

  test("committing while choosing a node is refused", () => {
    const state = newRun("actions-5");
    expect(() => applyAction(state, { type: "commit", mode: "ai" })).toThrow(InvalidActionError);
  });

  test("a merge conflict offers exactly the two ways out", () => {
    const { state } = findSeed((result) => result.state.phase.kind === "resolve_conflict", {
      prefix: "conflict",
      pick: prefer(isCommit("ai")),
      limit: 60,
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
      pick: prefer(isCommit("ai")),
      limit: 400,
    });

    expect(getAvailableActions(state)).toEqual([]);
    expect(() => applyAction(state, { type: "review" })).toThrow(InvalidActionError);
  });

  test("DevOps points only appear once they can be spent", () => {
    const { state } = play(newRun("actions-6"), { limit: 1 });
    expect(getAvailableActions(state).some(isType("devops"))).toBe(false);

    const rich = structuredClone(state);
    rich.devopsPoints = 5;
    expect(getAvailableActions(rich).some(isType("devops"))).toBe(true);
  });

  test("a maxed DevOps node stops being offered", () => {
    const { state } = play(newRun("actions-7"), { limit: 1 });
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
