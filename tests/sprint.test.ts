import { describe, expect, test } from "bun:test";

import { RELIC_IDS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { applyAction } from "@/game/core/rules/reducer";
import { availableSkills } from "@/game/core/rules/sprint";

import { eventsOfType, findSeed, isCommit, prefer } from "./helpers";

const policy = prefer(isCommit("ai"), isCommit("craft"));

describe("sprint boundary", () => {
  test("shipping a release offers three project improvements", () => {
    const { state, events } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "sprint",
      pick: policy,
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });

    expect(state.phase.kind).toBe("choose_relic");
    if (state.phase.kind !== "choose_relic") return;

    expect(state.phase.offer.length).toBe(3);
    expect(new Set(state.phase.offer).size).toBe(3);
    for (const id of state.phase.offer) expect(RELIC_IDS).toContain(id);

    const ended = eventsOfType(events, "sprint_ended");
    expect(ended.length).toBeGreaterThan(0);
  });

  test("the boundary is a rest: energy back, a DevOps point, no turn spent", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "rest",
      pick: policy,
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });

    expect(state.devopsPoints).toBeGreaterThanOrEqual(BALANCE.devops.perSprint);
    expect(state.player.energy).toBeGreaterThan(0);
  });

  test("choosing an improvement starts the next sprint", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "next",
      pick: policy,
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });
    if (state.phase.kind !== "choose_relic") return;

    const relicId = state.phase.offer[0];
    if (relicId === undefined) return;

    const after = applyAction(state, { type: "choose_relic", relicId }).state;
    expect(after.sprint).toBe(state.sprint + 1);
    expect(after.relics).toContain(relicId);
    expect(after.player.sprintProgress).toBe(0);
    expect(after.player.rerollUsed).toBe(false);
  });

  test("a new rival joins every sprint until the cap", () => {
    const { state } = findSeed((r) => r.state.sprint >= 3, {
      prefix: "arrivals",
      pick: policy,
      limit: 400,
    });

    const alive = Object.values(state.bots).filter((bot) => !bot.fired);
    expect(alive.length).toBeGreaterThanOrEqual(1);
    expect(alive.length).toBeLessThanOrEqual(BALANCE.bots.max);
  });

  test("the next sprint's nodes continue below the previous release", () => {
    const { state } = findSeed((r) => r.state.sprint >= 2, {
      prefix: "depths",
      pick: policy,
      limit: 300,
    });

    const first = Object.values(state.nodes).filter((node) => node.sprint === 1);
    const second = Object.values(state.nodes).filter((node) => node.sprint === 2);
    expect(second.length).toBeGreaterThan(0);

    const deepestFirst = Math.max(...first.map((node) => node.depth));
    const shallowestSecond = Math.min(...second.map((node) => node.depth));
    expect(shallowestSecond).toBeGreaterThan(deepestFirst);
  });

  test("a skill already earned is never offered again", () => {
    expect(availableSkills(["unit_tests", "linter"], ["linter"])).toEqual(["unit_tests"]);
  });

  test("bot trophies are never placed on the map", () => {
    expect(availableSkills(["sprint_final", "unit_tests"], [])).toEqual(["unit_tests"]);
  });
});
