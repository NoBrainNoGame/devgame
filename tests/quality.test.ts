import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { applyAction } from "@/game/core/rules/reducer";
import { openTickets } from "@/game/core/rules/tickets";

import {
  eventsOfType,
  findSeed,
  inHand,
  isCommit,
  isType,
  makeReady,
  plantAiCommit,
  policy,
  prefer,
  settle,
  submitAndMerge,
  ticketInHand,
} from "./helpers";

/** A ticket ready to merge that carries `count` unread machine-written commits. */
function shippingUnread(seed: string, count: number) {
  const state = makeReady(inHand(seed));
  for (let i = 0; i < count; i += 1) plantAiCommit(state);
  return state;
}

/** Runs the sprint clock out so the release ships what was merged. */
function closeSprint(state: ReturnType<typeof inHand>) {
  const forced = structuredClone(state);
  forced.sprintTurn = BALANCE.sprint.turns - 1;
  return submitAndMerge(forced);
}

describe("production", () => {
  test("the release rolls a bug for every unread machine-written commit shipped", () => {
    let incidents = 0;
    let releases = 0;

    for (let i = 0; i < 60; i += 1) {
      const result = closeSprint(shippingUnread(`ship-${i}`, 6));
      if (result.state.phase.kind === "resolve_conflict") continue;
      releases += 1;
      incidents += eventsOfType(result.events, "incident").filter(
        (e) => e.source === "release",
      ).length;
    }

    expect(releases).toBeGreaterThan(20);
    expect(incidents).toBeGreaterThan(0);
  });

  test("a release of hand-written or reviewed work never breaks", () => {
    for (let i = 0; i < 40; i += 1) {
      const state = shippingUnread(`clean-ship-${i}`, 4);
      for (const id of ticketInHand(state).nodeIds) {
        const node = state.nodes[id];
        if (node !== undefined) node.commit.reviewed = true;
      }

      const result = closeSprint(state);
      expect(eventsOfType(result.events, "incident")).toEqual([]);
    }
  });

  test("an incident opens a hotfix and fills the gauge; a clean sprint drains it", () => {
    const { state, events } = findSeed(
      (r) => r.events.some((e) => e.type === "incident" && e.source === "release"),
      { prefix: "release-bug", pick: policy("ai"), limit: 400 },
    );

    const incident = eventsOfType(events, "incident").find((e) => e.source === "release");
    if (incident === undefined) throw new Error("expected a release incident");
    expect(state.tickets[incident.ticketId]?.kind).toBe("hotfix");

    const quality = eventsOfType(events, "quality");
    expect(quality.some((e) => e.delta === BALANCE.quality.perIncident)).toBe(true);
  });

  test("a clean sprint lowers the gauge", () => {
    const state = makeReady(inHand("decay"));
    state.quality = 40;
    state.sprintIncidents = 0;
    const result = closeSprint(state);
    if (result.state.phase.kind === "resolve_conflict") return;
    if (eventsOfType(result.events, "incident").length > 0) return;

    expect(result.state.quality).toBe(40 - BALANCE.quality.decayPerCleanSprint);
  });

  test("a full gauge is the sack", () => {
    const state = makeReady(inHand("fired"));
    state.quality = BALANCE.quality.max - BALANCE.quality.perIncident;
    for (let i = 0; i < 8; i += 1) plantAiCommit(state);

    // Enough unread work that at least one release out of many breaks.
    for (let i = 0; i < 40; i += 1) {
      const attempt = structuredClone(state);
      attempt.seed = `fired-${i}`;
      attempt.rng.s = i * 7919;
      const result = closeSprint(attempt);
      const incident = eventsOfType(result.events, "incident")[0];
      if (incident === undefined) continue;

      expect(result.state.phase).toEqual({ kind: "game_over", reason: "fired" });
      return;
    }
    throw new Error("no release broke in 40 attempts");
  });

  test("hotfix commits are exempt from the release roll", () => {
    const found = findSeed(
      (r) => r.events.some((e) => e.type === "incident" && e.source === "commit"),
      {
        prefix: "hotfix-exempt",
        pick: policy("ai"),
        limit: 200,
        stop: (_, latest) => latest.some((e) => e.type === "incident"),
      },
    );
    const state = settle(found.state);
    const hotfix = openTickets(state).find((ticket) => ticket.kind === "hotfix");
    if (hotfix === undefined) throw new Error("expected a hotfix ticket");

    // Write the hotfix by machine and ship it alone.
    let current = applyAction(state, { type: "checkout", ticketId: hotfix.id }).state;
    for (const ticket of openTickets(current)) {
      if (ticket.id !== hotfix.id) ticket.status = "merged";
    }
    current.shipped = [];
    for (let i = 0; i < 12 && current.tickets[hotfix.id]?.filled !== hotfix.points; i += 1) {
      const actions = prefer(isCommit("ai"))(current, [{ type: "commit", mode: "ai" }]);
      if (actions === undefined) break;
      current = applyAction(current, actions).state;
      if (current.phase.kind !== "choose_action") break;
    }
    if (current.tickets[hotfix.id]?.filled !== hotfix.points) return;

    const ready = structuredClone(current);
    ready.sprintTurn = BALANCE.sprint.turns - 1;
    ready.quality = 0;
    const result = submitAndMerge(ready);
    if (result.state.phase.kind === "resolve_conflict") return;

    expect(eventsOfType(result.events, "incident").filter((e) => e.source === "release")).toEqual(
      [],
    );
  });

  test("the sprint ships early when the board is empty", () => {
    const state = makeReady(inHand("early"));
    for (const ticket of Object.values(state.tickets)) {
      if (ticket.id !== state.player.ticketId) ticket.status = "merged";
    }

    const result = submitAndMerge(state);
    if (result.state.phase.kind === "resolve_conflict") return;
    expect(eventsOfType(result.events, "sprint_ended").length).toBe(1);
    expect(result.state.sprintTurn).toBeLessThan(BALANCE.sprint.turns);
  });

  test("the sprint clock ships the release before the burnout check", () => {
    const state = inHand("clock");
    state.sprintTurn = BALANCE.sprint.turns - 1;
    state.player.energy = 0;
    state.player.zeroEnergyStreak = BALANCE.energy.burnoutStreak - 1;

    const result = applyAction(state, { type: "commit", mode: "craft" });
    expect(eventsOfType(result.events, "sprint_ended").length).toBe(1);
    // The release refilled the tank, so the streak that would have ended the
    // run resets instead.
    expect(result.state.phase.kind).not.toBe("game_over");
  });

  test("submit and start are what a policy needs to keep a run moving", () => {
    const { state } = findSeed((r) => r.state.sprint >= 2, {
      prefix: "moving",
      pick: prefer(isType("merge"), isType("submit"), isCommit("ai"), isType("start")),
      limit: 300,
    });
    expect(state.sprint).toBeGreaterThanOrEqual(2);
  });
});
