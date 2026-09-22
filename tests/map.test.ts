import { describe, expect, test } from "bun:test";

import { checkInvariants, headOf } from "@/game/core/map/graph";
import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE, nodeSerial } from "@/game/core/map/layout";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { openTickets } from "@/game/core/rules/tickets";

import {
  findSeed,
  funded,
  hiringPolicy,
  inHand,
  isCommit,
  isType,
  makeReady,
  newRun,
  plantCommit,
  play,
  policy,
  prefer,
  submitAndMerge,
  ticketInHand,
} from "./helpers";

/**
 * There is no map to generate any more: the graph is written as the run is
 * played. So the structural rules are checked on played runs — several
 * hundred seeds, each driven a few dozen actions by a player who starts,
 * commits, and merges.
 */
describe("the written graph", () => {
  test("500 played seeds all satisfy the structural invariants", () => {
    const broken: string[] = [];
    for (let i = 0; i < 500; i++) {
      const { state } = play(newRun(`map-${i}`), { pick: policy("ai"), limit: 40 });
      const failures = checkInvariants(state);
      if (failures.length > 0) broken.push(`map-${i}: ${failures[0]?.rule} ${failures[0]?.detail}`);
    }
    expect(broken).toEqual([]);
  });

  test("300 seeds played with a hired team satisfy them too", () => {
    const broken: string[] = [];
    let teamCommits = 0;
    for (let i = 0; i < 300; i++) {
      const { state } = play(funded(`team-map-${i}`), { pick: hiringPolicy("ai"), limit: 60 });
      const failures = checkInvariants(state);
      if (failures.length > 0) {
        broken.push(`team-map-${i}: ${failures[0]?.rule} ${failures[0]?.detail}`);
      }
      for (const node of Object.values(state.nodes)) {
        if (node.commit.author !== undefined) teamCommits += 1;
      }
    }
    expect(broken).toEqual([]);
    // The policy has to have actually exercised the team, or this proves nothing.
    expect(teamCommits).toBeGreaterThan(300);
  });

  test("a fresh run has exactly one commit: dev, opened from nothing", () => {
    for (let i = 0; i < 50; i++) {
      const state = newRun(`fresh-${i}`);
      const nodes = Object.values(state.nodes);
      expect(nodes.length).toBe(1);
      expect(nodes[0]?.kind).toBe("sprint_start");
      expect(nodes[0]?.lane).toBe(DEV_LANE);
      expect(nodes[0]?.parents).toEqual([]);
      expect(headOf(state).id).toBe(nodes[0]?.id ?? "");
    }
  });

  test("main ships sprints, dev integrates tickets, and nothing is written on either", () => {
    // A run that reached its third sprint with something actually landed: a
    // player who restarted every rejected ticket leaves no work to inspect.
    const { state } = findSeed((r) => r.state.sprint >= 3 && r.state.ticketsDelivered > 0, {
      prefix: "trunk",
      pick: policy("ai"),
      limit: 400,
      stop: (s) => s.sprint >= 3,
    });

    const main = Object.values(state.nodes).filter((node) => node.lane === MAIN_LANE);
    const dev = Object.values(state.nodes).filter((node) => node.lane === DEV_LANE);
    expect(main.length).toBe(2 * (state.sprint - 1));
    for (const node of main) expect(["sprint_merge", "release"]).toContain(node.kind);
    for (const node of dev) expect(["sprint_start", "feature_merge"]).toContain(node.kind);

    const work = Object.values(state.nodes).filter((node) => node.lane >= FIRST_FEATURE_LANE);
    expect(work.length).toBeGreaterThan(0);
    for (const node of work) expect(node.ticketId).toBeDefined();
  });

  test("a sprint's release has two parents on main and the merge before it one from dev", () => {
    const { state } = findSeed((r) => r.state.sprint >= 3, {
      prefix: "release-parents",
      pick: policy("ai"),
      limit: 400,
      stop: (s) => s.sprint >= 3,
    });

    const merges = Object.values(state.nodes)
      .filter((node) => node.kind === "sprint_merge")
      .sort((a, b) => a.depth - b.depth);
    expect(merges.length).toBe(2);

    // The first sprint merge has only `dev` behind it; the second also has the
    // previous release, the way git records a merge on a branch with history.
    expect(merges[0]?.parents.length).toBe(1);
    expect(merges[1]?.parents.length).toBe(2);
    for (const merge of merges) {
      const fromDev = merge.parents.some((id) => state.nodes[id]?.lane === DEV_LANE);
      expect(fromDev).toBe(true);
    }
  });

  test("every written ticket has a column of its own, freed when it merges", () => {
    for (let i = 0; i < 60; i++) {
      // Start everything, merge nothing: as many columns as written tickets,
      // and none for a ticket nobody has committed on yet.
      const greedy = play(newRun(`columns-${i}`), {
        pick: prefer(isType("start"), isCommit("ai")),
        limit: 30,
      });
      for (const ticket of openTickets(greedy.state)) {
        expect(ticket.lane === undefined).toBe(ticket.nodeIds.length === 0);
      }
      const lanes = openTickets(greedy.state)
        .map((ticket) => ticket.lane)
        .filter((lane) => lane !== undefined);
      expect(new Set(lanes).size).toBe(lanes.length);
      for (const lane of lanes) expect(lane).toBeGreaterThanOrEqual(FIRST_FEATURE_LANE);
    }

    const { state } = play(newRun("free-column"), {
      pick: policy("ai"),
      limit: 300,
      stop: (s) => s.ticketsDelivered >= 1,
    });
    const merged = Object.values(state.tickets).find((ticket) => ticket.status === "merged");
    expect(merged?.lane).toBeUndefined();
  });

  test("a freed column goes to the next ticket that forks, so the graph stays narrow", () => {
    // Two tickets written side by side, the first one landed: the third
    // ticket forks into the column the first one handed back, not a new one.
    const state = inHand("reuse-column");
    plantCommit(state, "craft");
    const first = ticketInHand(state);
    const second = getAvailableActions(state).find(isType("start"));
    if (second?.type !== "start") throw new Error("expected a second ticket");
    const both = applyAction(state, second).state;
    const onSecond = applyAction(both, { type: "checkout", ticketId: second.ticketId }).state;
    plantCommit(onSecond, "craft");
    expect(onSecond.tickets[second.ticketId]?.lane).toBe(first.lane === 2 ? 3 : 2);

    const backOnFirst = applyAction(onSecond, { type: "checkout", ticketId: first.id }).state;
    const landed = submitAndMerge(makeReady(backOnFirst)).state;
    if (landed.phase.kind === "resolve_conflict") return;
    expect(landed.tickets[first.id]?.lane).toBeUndefined();

    const third = getAvailableActions(landed).find(isType("start"));
    if (third?.type !== "start") return;
    const withThird = applyAction(landed, third).state;
    const onThird = applyAction(withThird, { type: "checkout", ticketId: third.ticketId }).state;
    plantCommit(onThird, "craft");
    expect(onThird.tickets[third.ticketId]?.lane).toBe(first.lane);
    expect(checkInvariants(onThird)).toEqual([]);
  });

  test("a restart hands the column back with the commits", () => {
    const state = makeReady(inHand("restart-column"));
    state.debt = 90;
    const rejected = applyAction(state, { type: "submit" }).state;
    if (rejected.phase.kind !== "ticket_rejected") return;
    const restarted = applyAction(rejected, { type: "restart" }).state;
    expect(ticketInHand(restarted).lane).toBeUndefined();
    expect(checkInvariants(restarted)).toEqual([]);
  });

  test("node ids stay unique once later sprints are appended", () => {
    const { state } = play(newRun("append"), {
      pick: policy("ai"),
      limit: 400,
      stop: (s) => s.sprint >= 3,
    });

    const ids = Object.keys(state.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map(nodeSerial)).size).toBe(ids.length);
  });

  test("rows only ever go up: every commit is written after everything before it", () => {
    const { state } = play(newRun("rows"), { pick: policy("ai"), limit: 200 });
    const depths = Object.values(state.nodes).map((node) => node.depth);
    expect(new Set(depths).size).toBe(depths.length);
    expect(Math.max(...depths)).toBe(state.nextDepth - 1);
  });

  test("HEAD is always on a commit that exists, on the ticket in hand when it has one", () => {
    for (let i = 0; i < 40; i += 1) {
      const played = play(newRun(`head-${i}`), { pick: policy("ai"), limit: 80 });
      const state = played.state;

      const head = headOf(state);
      expect(state.nodes[head.id]).toBeDefined();

      const ticketId = state.player.ticketId;
      const ticket = ticketId === null ? undefined : state.tickets[ticketId];
      if (ticket !== undefined && ticket.nodeIds.length > 0) {
        expect(head.id).toBe(ticket.nodeIds[ticket.nodeIds.length - 1] ?? "");
      } else {
        expect(head.lane).toBe(DEV_LANE);
      }
    }
  });
});
