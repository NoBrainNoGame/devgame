import { describe, expect, test } from "bun:test";

import { DEV_RANK } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { monthTurns } from "@/game/core/rules/economy";
import { gatherEffects, wipExtra } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { ticketsOf } from "@/game/core/rules/team";
import { backlogTickets, playerTickets, sortedTickets } from "@/game/core/rules/tickets";
import type { RunState } from "@/game/core/types";

import { eventsOfType, funded, inHand, isType, play, policy } from "./helpers";

/**
 * The hired team: developers who take the backlog, write beside you and land
 * without you. What they must never do is touch your hand, your chain, your
 * debt or your merges.
 */

function withJunior(seed: string): RunState {
  const state = inHand(seed);
  state.money = 1000;
  return applyAction(state, { type: "hire", rank: "junior" }).state;
}

describe("hiring", () => {
  test("costs money, no turn, and is offered only when affordable and the team has room", () => {
    const state = inHand("hire");
    state.money = 0;
    expect(getAvailableActions(state).some(isType("hire"))).toBe(false);

    const rich = structuredClone(state);
    rich.money = DEV_RANK.junior.hireCost;
    const hire = getAvailableActions(rich).find((a) => a.type === "hire" && a.rank === "junior");
    expect(hire).toBeDefined();
    if (hire === undefined) return;

    const { state: after, events } = applyAction(rich, hire);
    expect(after.turn).toBe(rich.turn);
    expect(after.money).toBe(0);
    expect(after.devs.length).toBe(1);
    expect(eventsOfType(events, "hired").length).toBe(1);

    const full = structuredClone(rich);
    full.money = 100_000;
    for (let i = 0; i < BALANCE.team.maxDevs; i++) {
      full.devs.push({
        id: `d${i + 1}`,
        rank: "junior",
        hiredRank: "junior",
        delivered: 0,
        hiredSprint: 1,
      });
    }
    expect(getAvailableActions(full).some(isType("hire"))).toBe(false);
  });

  test("the recruiter takes a third off", () => {
    const state = inHand("recruiter");
    state.tree.recruiter = 1;
    state.money = 1000;
    const after = applyAction(state, { type: "hire", rank: "junior" }).state;
    expect(1000 - after.money).toBe(Math.round(DEV_RANK.junior.hireCost * 0.7));
  });
});

describe("the team's turn", () => {
  test("a developer takes the oldest feature waiting, never your hand, never a forced ticket", () => {
    const state = withJunior("pull");
    const waiting = backlogTickets(state);
    expect(waiting.length).toBeGreaterThan(0);
    const oldest = waiting[0];
    if (oldest === undefined) return;

    const { state: after, events } = applyAction(state, { type: "rest" });
    const assigned = eventsOfType(events, "ticket_assigned");
    expect(assigned.length).toBe(1);
    expect(assigned[0]?.ticketId).toBe(oldest.id);
    expect(after.tickets[oldest.id]?.assignee).toBe("d1");
    expect(after.tickets[oldest.id]?.status).toBe("open");
    expect(after.player.ticketId).toBe(state.player.ticketId);
    expect(
      getAvailableActions(after).some((a) => a.type === "checkout" && a.ticketId === oldest.id),
    ).toBe(false);
    expect(checkInvariants(after)).toEqual([]);

    // A hotfix is production's business, and stays yours.
    const forced = structuredClone(state);
    for (const ticket of sortedTickets(forced)) {
      if (ticket.status === "backlog") delete forced.tickets[ticket.id];
    }
    const id = `t${forced.nextTicketSerial}`;
    forced.nextTicketSerial += 1;
    forced.tickets[id] = {
      id,
      kind: "hotfix",
      status: "backlog",
      points: 2,
      filled: 0,
      rework: 0,
      debtAdded: 0,
      rejections: 0,
      tier: 0,
      load: 0,
      mrr: 0,
      sprintArrived: 1,
      devMergesAtOpen: 0,
      nodeIds: [],
      mustWrite: "hotfix",
    };
    const untouched = applyAction(forced, { type: "rest" }).state;
    expect(untouched.tickets[id]?.assignee).toBeUndefined();
  });

  test("a team commit fills points without touching your chain, your debt or your count", () => {
    const state = withJunior("commit");
    state.player.aiChain = 3;
    const first = applyAction(state, { type: "rest" }).state;
    const { state: after, events } = applyAction(first, { type: "rest" });

    const authored = eventsOfType(events, "node_done").filter(
      (e) => after.nodes[e.nodeId]?.commit.author === "d1",
    );
    expect(authored.length).toBe(1);
    // Picked up and written on the first turn, written again on the second.
    const ticket = ticketsOf(after, "d1")[0];
    expect(ticket?.filled).toBe(2 * BALANCE.team.pointsPerTurn);
    expect(after.player.aiChain).toBe(3);
    expect(after.debt).toBe(state.debt);
    expect(after.player.totalCommits).toBe(state.player.totalCommits);
    expect(wipExtra(after)).toBe(wipExtra(state));
    expect(playerTickets(after).map((t) => t.id)).toEqual(playerTickets(state).map((t) => t.id));
  });

  test("a full ticket lands by itself: no energy, no merge under your feet, the skill is yours", () => {
    const state = withJunior("land");
    const target = backlogTickets(state)[0];
    if (target === undefined) throw new Error("expected a backlog ticket");
    target.points = 1;
    target.skillId = "coffee";
    state.player.energy = 10;

    // One point: picked up, written and landed in the same turn.
    const first = state;
    const { state: after, events } = applyAction(first, { type: "rest" });

    const merged = eventsOfType(events, "ticket_merged").filter((e) => e.devId === "d1");
    expect(merged.length).toBe(1);
    expect(after.tickets[target.id]?.status).toBe("merged");
    expect(after.tickets[target.id]?.assignee).toBeUndefined();
    expect(after.skills).toContain("coffee");
    expect(after.pointsDelivered).toBe(first.pointsDelivered + 1);
    expect(after.ticketsDelivered).toBe(first.ticketsDelivered + 1);
    expect(after.devMerges).toBe(first.devMerges);
    expect(after.player.totalCommits).toBe(first.player.totalCommits);
    expect(after.sprintPlayerDelivered).toBe(first.sprintPlayerDelivered);
    // One rest, worth the rest's regen, and the skill's raised ceiling — no
    // merge cost, no merge regen.
    const energy = eventsOfType(events, "energy").filter(
      (e) => e.reason !== "rest" && e.reason !== "max_raised",
    );
    expect(energy).toEqual([]);
    expect(after.devs[0]?.delivered).toBe(1);
    expect(checkInvariants(after)).toEqual([]);
  });

  test("a developer is promoted every few tickets, up to senior", () => {
    const state = withJunior("promote");
    const dev = state.devs[0];
    if (dev === undefined) throw new Error("expected a developer");
    dev.delivered = BALANCE.team.promoteEvery - 1;
    const target = backlogTickets(state)[0];
    if (target === undefined) throw new Error("expected a backlog ticket");
    target.points = 1;

    const { state: after, events } = applyAction(state, { type: "rest" });
    expect(eventsOfType(events, "dev_promoted").length).toBe(1);
    expect(after.devs[0]?.rank).toBe("mid");

    const top = structuredClone(after);
    const senior = top.devs[0];
    if (senior === undefined) return;
    senior.rank = "senior";
    senior.delivered = BALANCE.team.promoteEvery * 5 - 1;
    const t = backlogTickets(top)[0];
    if (t === undefined) return;
    t.points = 1;
    const { events: later } = applyAction(top, { type: "rest" });
    expect(eventsOfType(later, "ticket_merged").some((e) => e.devId === "d1")).toBe(true);
    expect(eventsOfType(later, "dev_promoted")).toEqual([]);
  });
});

describe("payday for the team", () => {
  test("an unpaid developer leaves and hands their tickets back, column and all", () => {
    const state = withJunior("unpaid");
    state.money = 0;
    const working = applyAction(state, { type: "rest" }).state;
    const held = ticketsOf(working, "d1").map((t) => t.id);
    expect(held.length).toBe(1);

    working.sprintTurn = monthTurns() - 1;
    working.money = DEV_RANK.junior.salary - 1;
    const { state: after, events } = applyAction(working, { type: "rest" });

    const left = eventsOfType(events, "dev_left");
    expect(left.length).toBe(1);
    expect(left[0]?.ticketIds).toEqual(held);
    expect(after.devs).toEqual([]);
    for (const id of held) {
      const ticket = after.tickets[id];
      expect(ticket?.status).toBe("open");
      expect(ticket?.assignee).toBeUndefined();
      expect(ticket?.lane).toBe(working.tickets[id]?.lane);
      expect(
        getAvailableActions(after).some((a) => a.type === "checkout" && a.ticketId === id),
      ).toBe(true);
    }
    expect(checkInvariants(after)).toEqual([]);
  });

  test("a paid developer stays, and the salary is on the bill", () => {
    const state = withJunior("paid");
    state.sprintTurn = monthTurns() - 1;
    state.money = 500;
    const { state: after, events } = applyAction(state, { type: "rest" });
    expect(after.devs.length).toBe(1);
    expect(eventsOfType(events, "month_closed")[0]?.salaries).toBe(DEV_RANK.junior.salary);
  });
});

describe("a sprint you sat out", () => {
  test("costs patience, however busy the team was", () => {
    const state = funded("idle");
    const hired = applyAction(state, { type: "hire", rank: "senior" }).state;
    const rested = play(hired, {
      pick: (_, actions) => actions.find(isType("rest")),
      limit: 20,
      stop: (_, events) => events.some((e) => e.type === "sprint_ended"),
    });
    expect(rested.events.some((e) => e.type === "sprint_ended")).toBe(true);
    const quality = eventsOfType(rested.events, "quality");
    expect(quality.some((e) => e.delta === BALANCE.quality.perIdleSprint)).toBe(true);
  });

  test("a run with a team and a resting player still ends", () => {
    const state = funded("no-forever", 100_000);
    const run = play(state, {
      pick: (_, actions) =>
        actions.find((a) => a.type === "hire" && a.rank === "senior") ??
        actions.find(isType("choose_relic")) ??
        actions.find(isType("rest")),
      limit: 2000,
    });
    expect(run.state.phase.kind).toBe("game_over");
  });

  test("the team picks up the backlog before the board forces it on you", () => {
    const state = funded("pull-first");
    const hired = applyAction(state, { type: "hire", rank: "senior" }).state;
    const run = play(hired, {
      pick: (_, actions) => actions.find(isType("choose_relic")) ?? actions.find(isType("rest")),
      limit: 40,
      stop: (s) => s.sprint >= 3,
    });
    const forcedFeatures = eventsOfType(run.events, "ticket_started").filter(
      (e) => e.forced && e.kind === "feature",
    );
    expect(forcedFeatures).toEqual([]);
    expect(gatherEffects(run.state)).toBeDefined();
  });
});

describe("the hired game is the same game", () => {
  test("hiring draws nothing from the seed: the next rolls are unchanged", () => {
    const state = funded("pure-team");
    const started = applyAction(
      state,
      getAvailableActions(state).find(isType("start")) ?? { type: "rest" },
    ).state;
    const hired = applyAction(started, { type: "hire", rank: "junior" }).state;

    const plain = play(started, { pick: policy("craft"), limit: 8 });
    const teamed = play(hired, { pick: policy("craft"), limit: 8 });
    const rolls = (events: typeof plain.events) =>
      eventsOfType(events, "roll").map((e) => e.rolled);
    expect(rolls(teamed.events)).toEqual(rolls(plain.events));
  });
});
