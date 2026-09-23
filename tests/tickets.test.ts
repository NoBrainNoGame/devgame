import { describe, expect, test } from "bun:test";

import { SKILL_IDS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { ticketsFor } from "@/game/core/map/tickets";
import { getAvailableActions } from "@/game/core/rules/actions";
import { energyMax } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { availableSkills } from "@/game/core/rules/sprint";
import { backlogTickets, openTickets, sortedTickets } from "@/game/core/rules/tickets";
import { createRun } from "@/game/core/run";
import { SAVE_VERSION } from "@/game/dto/version";

import {
  eventsOfType,
  findSeed,
  inHand,
  isType,
  newRun,
  plantCommit,
  play,
  policy,
  settle,
} from "./helpers";

describe("the backlog", () => {
  test("a sprint brings the tickets the balance says, more as the project goes on", () => {
    const { base, growEvery, maxPerSprint } = BALANCE.tickets;
    expect(ticketsFor(1, 0)).toBe(base);
    expect(ticketsFor(1 + growEvery, 0)).toBe(base + 1);
    expect(ticketsFor(999, 0)).toBe(maxPerSprint);

    for (let i = 0; i < 50; i += 1) {
      const state = newRun(`arrivals-${i}`);
      expect(backlogTickets(state).length).toBe(ticketsFor(1, 0));
      expect(openTickets(state)).toEqual([]);
    }
  });

  test("the first ticket of a sprint always carries a skill, and it costs more points", () => {
    for (let i = 0; i < 100; i += 1) {
      const state = newRun(`frontier-${i}`);
      const tickets = sortedTickets(state);
      const first = tickets[0];
      expect(first?.skillId).toBeDefined();

      const { points, skillExtraPoints } = BALANCE.tickets;
      for (const ticket of tickets) {
        // The other kinds size themselves; see `tests/kinds.test.ts`.
        if (ticket.kind !== "feature") continue;
        if (ticket.skillId === undefined) {
          expect(ticket.points).toBeGreaterThanOrEqual(points.min);
          expect(ticket.points).toBeLessThanOrEqual(points.max);
        } else {
          expect(ticket.points).toBeGreaterThanOrEqual(points.min + skillExtraPoints.min);
          expect(ticket.points).toBeLessThanOrEqual(points.max + skillExtraPoints.max);
        }
      }
    }
  });

  test("a skill is never promised twice", () => {
    const { state } = findSeed((r) => r.state.sprint >= 3, {
      prefix: "unique-skill",
      pick: policy("ai"),
      limit: 400,
    });

    const promised = sortedTickets(state)
      .filter((ticket) => ticket.status !== "merged")
      .map((ticket) => ticket.skillId)
      .filter((id) => id !== undefined);
    expect(new Set(promised).size).toBe(promised.length);
    for (const id of promised) expect(state.skills).not.toContain(id);
  });

  test("starting a ticket is free and puts it in hand; its column comes with the first commit", () => {
    const state = newRun("start");
    const start = getAvailableActions(state).find(isType("start"));
    if (start?.type !== "start") throw new Error("expected a start");

    const after = applyAction(state, start).state;
    const ticket = after.tickets[start.ticketId];

    expect(after.turn).toBe(state.turn);
    expect(ticket?.status).toBe("open");
    // Open but unwritten: no column yet, so the graph shows no empty lane.
    expect(ticket?.lane).toBeUndefined();
    expect(after.player.ticketId).toBe(start.ticketId);

    plantCommit(after, "craft");
    expect(after.tickets[start.ticketId]?.lane).toBeGreaterThanOrEqual(2);
  });

  test("a second ticket takes its own column once written, and switching is free", () => {
    const one = inHand("two-columns");
    plantCommit(one, "craft");
    const start = getAvailableActions(one).find(isType("start"));
    if (start?.type !== "start") throw new Error("expected a second ticket");

    const two = applyAction(one, start).state;
    const written = applyAction(two, { type: "checkout", ticketId: start.ticketId }).state;
    plantCommit(written, "craft");
    const lanes = openTickets(written).map((ticket) => ticket.lane);
    expect(new Set(lanes).size).toBe(2);
    // Starting a second one does not pull you off the first.
    expect(two.player.ticketId).toBe(one.player.ticketId);

    const switched = applyAction(two, { type: "checkout", ticketId: start.ticketId }).state;
    expect(switched.player.ticketId).toBe(start.ticketId);
    expect(switched.turn).toBe(two.turn);
  });

  test("a skill ticket nobody started expires with its sprint, and its skill returns to the pool", () => {
    const state = inHand("expire");
    state.unlockedSkills = ["coffee", "unit_tests", "linter"];
    for (const ticket of sortedTickets(state)) ticket.skillId = undefined;
    const waiting = backlogTickets(state)[0];
    if (waiting === undefined) throw new Error("expected a backlog ticket");
    waiting.skillId = "coffee";
    state.sprintTurn = BALANCE.sprint.turns - 1;

    const result = applyAction(state, { type: "rest" });
    const closed = settle(result.state);
    expect(closed.sprint).toBe(state.sprint + 1);
    expect(closed.tickets[waiting.id]?.status).toBe("cancelled");
    expect(closed.tickets[waiting.id]?.lane).toBeUndefined();
    // The sprint boundary runs through the relic choice, so the line is read
    // from the log rather than from one action's events.
    expect(closed.log.some((line) => line.text.key === "log.ticket_cancelled")).toBe(true);
    // Never forced on you, never taken by the team.
    expect(openTickets(closed).some((ticket) => ticket.id === waiting.id)).toBe(false);
    // Back in the pool for this sprint's arrivals or the next — or already
    // promised again by one of them.
    const promisedAgain = sortedTickets(closed).some(
      (ticket) => ticket.id !== waiting.id && ticket.skillId === "coffee",
    );
    expect(availableSkills(closed).includes("coffee") || promisedAgain).toBe(true);
    expect(checkInvariants(closed)).toEqual([]);
  });

  test("the Product owner node makes skill tickets more frequent, on the same draws", () => {
    const skillTickets = (level: number): number => {
      let count = 0;
      for (let i = 0; i < 120; i += 1) {
        const state = newRun(`po-${i}`);
        state.tree.product_owner = level;
        state.unlockedSkills = [...SKILL_IDS];
        const next = settle(play(state, { pick: policy("craft"), limit: 40 }).state);
        count += sortedTickets(next).filter((t) => t.skillId !== undefined).length;
      }
      return count;
    };
    expect(skillTickets(3)).toBeGreaterThan(skillTickets(0));
  });

  test("a ticket left in the backlog past its grace is assigned to you", () => {
    // Start one ticket and never another: everything else sits in the backlog
    // until the board hands it over. Hand-written on a deep tank, so the run
    // reaches the sprint where that happens without burning out or shipping
    // anything broken.
    const deep = createRun({
      seed: "assigned",
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    // Enough energy to sit through a whole sprint without burning out: the
    // test is about the board's patience, not the player's.
    deep.tree.stamina = 100;
    deep.player.energyMax = energyMax(deep);
    deep.player.energy = deep.player.energyMax;
    // Only a feature can wait past the grace: a customer's bug is gone with
    // its sprint, and the codebase's own request is never forced. Everything
    // waiting at the start is made a feature so the board has one to force.
    for (const ticket of sortedTickets(deep)) {
      if (ticket.status === "backlog" && ticket.kind !== "feature") {
        ticket.kind = "feature";
        delete ticket.deadlineSprint;
      }
    }
    let started = false;
    const idle = play(deep, {
      pick: (state, actions) => {
        if (state.player.ticketId === null && !started) {
          started = true;
          return actions.find((a) => a.type === "start");
        }
        // Deliver what is full, so production has no idle sprint to resent
        // before the board gets round to forcing a ticket.
        return (
          actions.find((a) => a.type === "submit") ??
          actions.find((a) => a.type === "merge") ??
          actions.find((a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined) ??
          actions.find((a) => a.type !== "start")
        );
      },
      limit: 120,
      stop: (_, events) =>
        events.some((e) => e.type === "ticket_started" && e.forced && e.kind === "feature"),
    });

    // A hotfix is forced open too, but that is production's doing, not the
    // board's: only a feature left waiting counts here.
    const forced = eventsOfType(idle.events, "ticket_started").filter(
      (e) => e.forced && e.kind === "feature",
    );
    expect(forced.length).toBeGreaterThan(0);
    const first = forced[0];
    if (first === undefined) return;

    const ticket = idle.state.tickets[first.ticketId];
    expect(ticket?.status).toBe("open");
    expect(idle.state.sprint - (ticket?.sprintArrived ?? 0)).toBeGreaterThan(
      BALANCE.tickets.graceSprints,
    );
  });

  test("tickets are ordered by number, not by spelling, past the tenth", () => {
    // A careful hand: the machine-only policy is fired before its twelfth ticket.
    const { state } = findSeed((r) => r.state.nextTicketSerial > 12, {
      prefix: "serial",
      pick: policy("craft"),
      limit: 600,
    });

    const ids = sortedTickets(state).map((ticket) => Number(ticket.id.slice(1)));
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });
});
