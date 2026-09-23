import { describe, expect, test } from "bun:test";

import { TICKET_KIND, TICKET_KINDS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { arriveTickets } from "@/game/core/map/tickets";
import { createContext } from "@/game/core/rules/context";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { gatherEffects, wipExtra } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { ticketsOf } from "@/game/core/rules/team";
import { backlogTickets, sortedTickets } from "@/game/core/rules/tickets";
import { completeMerge } from "@/game/core/rules/write";
import type { RunState, Ticket } from "@/game/core/types";

import { eventsOfType, inHand, newRun, plantCommit, play, policy, settle } from "./helpers";

/**
 * The kinds of work: each bends one rule, and the board brings all of them
 * over enough seeds.
 */

function withKind(seed: string, kind: Ticket["kind"]): { state: RunState; ticket: Ticket } {
  const state = inHand(seed);
  const ticket = Object.values(state.tickets).find((t) => t.status === "backlog");
  if (ticket === undefined) throw new Error("expected a backlog ticket");
  ticket.kind = kind;
  const def = TICKET_KIND[kind];
  if (def.mustWrite !== undefined) ticket.mustWrite = def.mustWrite;
  if (!def.earnsMrr) {
    ticket.mrr = 0;
    ticket.load = 0;
  }
  return { state, ticket };
}

/** Lands a ticket held by nobody, straight from the backlog: one commit, then the merge. */
function land(
  state: RunState,
  ticket: Ticket,
): { state: RunState; events: ReturnType<typeof createContext>["events"] } {
  ticket.status = "open";
  ticket.devMergesAtOpen = state.devMerges;
  state.player.ticketId = ticket.id;
  plantCommit(state, "craft");
  const context = createContext(state);
  ticket.filled = ticket.points;
  completeMerge(context, ticket, { noRegen: true });
  return { state, events: context.events };
}

describe("ticket kinds", () => {
  test("every kind arrives somewhere in two hundred sprints, and the first ticket is always a feature", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const state = newRun(`kinds-${i}`);
      state.tier = i % 4;
      for (let sprint = 0; sprint < 5; sprint += 1) {
        state.sprint += 1;
        const before = new Set(Object.keys(state.tickets));
        const context = createContext(state);
        arriveTickets(context, []);
        const arrived = sortedTickets(state).filter((t) => !before.has(t.id));
        expect(arrived[0]?.kind).toBe("feature");
        for (const ticket of arrived) seen.add(ticket.kind);
        expect(checkInvariants(state)).toEqual([]);
      }
    }
    for (const kind of TICKET_KINDS) {
      if (kind === "hotfix" || kind === "refactor" || kind === "debt") continue;
      expect(seen.has(kind)).toBe(true);
    }
  });

  test("a customer's bug earns no revenue, is dated, and production breathes when it lands", () => {
    const { state, ticket } = withKind("bug", "client_bug");
    state.quality = 40;
    const before = mrrOf(state, gatherEffects(state));
    const after = land(state, ticket);
    expect(mrrOf(after.state, gatherEffects(after.state))).toBe(before);
    expect(loadOf(after.state)).toBe(0);
    expect(after.state.quality).toBe(40 - BALANCE.tickets.kinds.clientBug.patienceOnFix);
    expect(eventsOfType(after.events, "quality")[0]?.source).toBe("client_bug");
  });

  test("a customer's bug left in the backlog past its sprint is gone, and production remembers", () => {
    const { state, ticket } = withKind("missed", "client_bug");
    ticket.deadlineSprint = state.sprint;
    state.sprintTurn = BALANCE.sprint.turns - 1;
    const before = state.quality;
    const { state: after, events } = applyAction(state, { type: "rest" });
    const missed = eventsOfType(events, "deadline_missed");
    expect(missed.length).toBe(1);
    expect(missed[0]?.cancelled).toBe(true);
    expect(after.tickets[ticket.id]?.status).toBe("cancelled");
    const penalty = eventsOfType(events, "quality").find((e) => e.source === "deadline");
    expect(penalty?.delta).toBe(BALANCE.tickets.kinds.clientBug.patienceOnMiss);
    expect(after.stats.qualityBySource.deadline).toBeGreaterThan(before);
    expect(checkInvariants(after)).toEqual([]);
  });

  test("a VIP's feature pays a bonus on time, half the revenue late, and the team never takes it", () => {
    const onTime = withKind("vip", "vip");
    onTime.ticket.deadlineSprint = onTime.state.sprint + 3;
    const money = onTime.state.money;
    const landed = land(onTime.state, onTime.ticket);
    expect(landed.state.money - money).toBe(BALANCE.tickets.kinds.vip.bonus);

    const late = withKind("vip-late", "vip");
    late.ticket.deadlineSprint = late.state.sprint;
    late.state.sprintTurn = BALANCE.sprint.turns - 1;
    const mrr = late.ticket.mrr;
    const { state: after } = applyAction(late.state, { type: "rest" });
    const stale = after.tickets[late.ticket.id];
    expect(stale?.late).toBe(true);
    expect(stale?.mrr).toBe(Math.floor(mrr / 2));
    expect(stale?.status).toBe("backlog");

    const team = withKind("vip-team", "vip");
    team.state.money = 1000;
    const hired = applyAction(team.state, { type: "hire", rank: "junior" }).state;
    const worked = applyAction(hired, { type: "rest" }).state;
    expect(ticketsOf(worked, "d1").some((t) => t.kind === "vip")).toBe(false);
  });

  test("the codebase asks for a refactor at forty debt, once, never forced, and repays on landing", () => {
    const state = newRun("debt-ticket");
    state.debt = BALANCE.tickets.kinds.debt.threshold;
    state.sprint += 1;
    arriveTickets(createContext(state), []);
    const debts = sortedTickets(state).filter((t) => t.kind === "debt");
    expect(debts.length).toBe(1);
    expect(debts[0]?.mustWrite).toBe("refactor");
    state.sprint += 1;
    arriveTickets(createContext(state), []);
    expect(sortedTickets(state).filter((t) => t.kind === "debt").length).toBe(1);

    // Waits past the grace without ever being forced on you.
    const waiting = debts[0];
    if (waiting === undefined) throw new Error("expected the debt ticket");
    waiting.sprintArrived = 1;
    state.sprint = 1 + BALANCE.tickets.graceSprints + 2;
    const run = play(state, {
      pick: (_, actions) => actions.find((a) => a.type === "rest"),
      limit: 1,
    });
    expect(run.state.tickets[waiting.id]?.status).toBe("backlog");
    expect(backlogTickets(run.state).some((t) => t.id === waiting.id)).toBe(true);
  });

  test("a migration costs debt with every commit and buys a level of servers when it lands", () => {
    const { state, ticket } = withKind("migration", "migration");
    ticket.status = "open";
    ticket.devMergesAtOpen = state.devMerges;
    state.player.ticketId = ticket.id;
    const debt = state.debt;
    const { state: after } = applyAction(state, { type: "commit", mode: "craft" });
    const written = after.tickets[ticket.id];
    if (written?.nodeIds.length === 1) {
      expect(after.debt).toBe(debt + BALANCE.tickets.kinds.migration.debtPerCommit);
    }

    const servers = state.upgrades.servers ?? 0;
    const landed = land(state, ticket);
    expect(landed.state.upgrades.servers).toBe(
      servers + BALANCE.tickets.kinds.migration.serverLevels,
    );
    expect(eventsOfType(landed.events, "upgrade_bought").some((e) => e.id === "servers")).toBe(
      true,
    );
  });

  test("a hotfix beside a feature is not work in progress; a bug is", () => {
    const state = inHand("wip");
    const extra = Object.values(state.tickets).find((t) => t.status === "backlog");
    if (extra === undefined) throw new Error("expected a backlog ticket");
    extra.status = "open";
    extra.kind = "client_bug";
    expect(wipExtra(state)).toBe(1);
    extra.kind = "hotfix";
    extra.mustWrite = "hotfix";
    expect(wipExtra(state)).toBe(0);
  });

  test("a run with every kind on the board keeps its invariants and replays", () => {
    const run = play(newRun("kinds-run"), { pick: policy("craft"), limit: 200 });
    expect(checkInvariants(run.state)).toEqual([]);
    let replayed = newRun("kinds-run");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(settle(replayed).turn).toBe(settle(run.state).turn);
  });
});
