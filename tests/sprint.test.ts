import { describe, expect, test } from "bun:test";

import { RELIC_IDS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { ticketsFor } from "@/game/core/map/tickets";
import { applyAction } from "@/game/core/rules/reducer";
import { availableSkills } from "@/game/core/rules/sprint";
import { backlogTickets, sortedTickets } from "@/game/core/rules/tickets";

import { eventsOfType, findSeed, newRun, policy } from "./helpers";

describe("sprint boundary", () => {
  test("shipping a release offers three project improvements", () => {
    const { state, events } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "sprint",
      pick: policy("ai"),
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

  test("the boundary is a rest: energy back, a skill point", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "rest",
      pick: policy("ai"),
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });

    expect(state.skillPoints).toBeGreaterThanOrEqual(BALANCE.tree.perSprint);
    expect(state.player.energy).toBeGreaterThan(0);
  });

  test("the clock ships the release at the end of the box", () => {
    const { state, events } = findSeed((r) => r.events.some((e) => e.type === "sprint_ended"), {
      prefix: "clock",
      // Never merge: only the clock can end the sprint.
      pick: (_, actions) =>
        actions.find((a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined) ??
        actions.find((a) => a.type === "start"),
      limit: 60,
      stop: (_, latest) => latest.some((e) => e.type === "sprint_ended"),
    });
    expect(eventsOfType(events, "sprint_ended").length).toBe(1);
    expect(state.turn).toBeGreaterThanOrEqual(BALANCE.sprint.turns);
  });

  test("choosing an improvement starts the next sprint, with new tickets", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "next",
      pick: policy("ai"),
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });
    if (state.phase.kind !== "choose_relic") return;

    const relicId = state.phase.offer[0];
    if (relicId === undefined) return;

    const result = applyAction(state, { type: "choose_relic", relicId });
    const after = result.state;
    expect(after.sprint).toBe(state.sprint + 1);
    expect(after.sprintTurn).toBe(0);
    expect(after.relics).toContain(relicId);
    expect(after.player.rerollUsed).toBe(false);
    expect(eventsOfType(result.events, "ticket_arrived").length).toBe(
      ticketsFor(after.sprint, after.tier),
    );

    // The new sprint opens on `dev`, below everything already written.
    const anchor = eventsOfType(result.events, "node_done").find((e) => e.kind === "sprint_start");
    expect(anchor).toBeDefined();
  });

  test("the next sprint's commits continue below the previous release", () => {
    const { state } = findSeed((r) => r.state.sprint >= 2, {
      prefix: "depths",
      pick: policy("ai"),
      limit: 300,
    });

    const first = Object.values(state.nodes).filter((node) => node.sprint === 1);
    const second = Object.values(state.nodes).filter((node) => node.sprint === 2);
    expect(second.length).toBeGreaterThan(0);

    const deepestFirst = Math.max(...first.map((node) => node.depth));
    const shallowestSecond = Math.min(...second.map((node) => node.depth));
    expect(shallowestSecond).toBeGreaterThan(deepestFirst);
  });

  test("a skill already earned or already promised is never offered again", () => {
    const state = newRun("skills");
    state.skills = ["linter"];
    state.unlockedSkills = ["unit_tests", "linter", "coffee"];
    for (const ticket of sortedTickets(state)) ticket.skillId = undefined;
    const first = backlogTickets(state)[0];
    if (first !== undefined) first.skillId = "coffee";

    expect(availableSkills(state)).toEqual(["unit_tests"]);

    // An expired offer is not a promise: its skill is back on the table.
    if (first !== undefined) first.status = "cancelled";
    expect(availableSkills(state)).toEqual(["coffee", "unit_tests"]);
  });
});
