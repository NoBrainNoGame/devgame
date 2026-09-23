import { describe, expect, test } from "bun:test";

import { UPGRADES, upgradeCost } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { monthlyReport, monthTurns } from "@/game/core/rules/economy";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { skillPointPrice } from "@/game/core/rules/shop";
import { sortedTickets } from "@/game/core/rules/tickets";
import type { RunState } from "@/game/core/types";

import { eventsOfType, findSeed, inHand, isType, newRun, play, policy } from "./helpers";

/**
 * The money. A month is a third of a sprint, every shipped feature pays every
 * month, and what it pays for is the management half of the game.
 */

/** A shipped feature, planted straight onto the board, with the users it brings. */
function shipFeature(state: RunState, mrr: number, load = 50): void {
  const id = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;
  state.tickets[id] = {
    id,
    kind: "feature",
    status: "merged",
    points: 5,
    filled: 5,
    rework: 0,
    debtAdded: 0,
    rejections: 0,
    tier: 0,
    load,
    mrr,
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
  };
}

describe("the month", () => {
  test("a sprint holds a whole number of months", () => {
    expect(Number.isInteger(monthTurns())).toBe(true);
    expect(monthTurns()).toBeGreaterThan(0);
  });

  test("three paydays a sprint, whether the clock runs out or the board empties", () => {
    // The clock: never merge, so only the box ends the sprint.
    const clocked = findSeed((r) => r.events.some((e) => e.type === "sprint_ended"), {
      prefix: "months-clock",
      pick: (_, actions) =>
        actions.find((a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined) ??
        actions.find((a) => a.type === "start"),
      limit: 40,
      stop: (_, events) => events.some((e) => e.type === "sprint_ended"),
    });
    expect(eventsOfType(clocked.events, "month_closed").length).toBe(
      BALANCE.economy.monthsPerSprint,
    );

    // The board: one ticket of one point, so the sprint ends long before the
    // clock does. It still pays its three months, and no more.
    const tiny = inHand("months-early");
    for (const ticket of sortedTickets(tiny)) {
      if (ticket.status === "backlog") delete tiny.tickets[ticket.id];
      else ticket.points = 1;
    }
    const emptied = play(tiny, {
      pick: policy("craft"),
      limit: 20,
      stop: (_, events) => events.some((e) => e.type === "sprint_ended"),
    });
    expect(emptied.events.some((e) => e.type === "sprint_ended")).toBe(true);
    expect(emptied.state.sprintTurn).toBeLessThan(BALANCE.sprint.turns);
    expect(eventsOfType(emptied.events, "month_closed").length).toBe(
      BALANCE.economy.monthsPerSprint,
    );
  });

  test("every shipped feature pays its revenue, and a forced ticket pays nothing", () => {
    const state = newRun("mrr");
    const features = sortedTickets(state).filter((ticket) => ticket.kind === "feature");
    expect(features.length).toBeGreaterThan(0);
    for (const ticket of features) {
      expect(ticket.mrr).toBeGreaterThanOrEqual(
        ticket.points * BALANCE.economy.mrrPerPoint + BALANCE.economy.mrrJitter.min,
      );
      expect(ticket.mrr).toBeLessThanOrEqual(
        ticket.points * BALANCE.economy.mrrPerPoint + BALANCE.economy.mrrJitter.max,
      );
    }

    const rich = structuredClone(state);
    shipFeature(rich, 10);
    shipFeature(rich, 7);
    const report = monthlyReport(rich, gatherEffects(rich));
    expect(report.mrr).toBe(17);
    expect(report.revenue).toBe(17);
    expect(report.lost).toBe(0);
  });

  test("every payday is a month of history, and the history is capped", () => {
    const state = inHand("history");
    state.sprintTurn = monthTurns() - 1;
    const after = applyAction(state, { type: "rest" }).state;
    expect(after.finance.length).toBe(1);
    expect(after.finance[0]?.month).toBe(1);
    expect(after.finance[0]?.money).toBe(after.money);

    const long = structuredClone(after);
    for (let i = 0; i < BALANCE.economy.historyMonths + 5; i += 1) {
      long.finance.push({ ...(after.finance[0] as (typeof after.finance)[number]), month: i + 2 });
    }
    long.sprintTurn = monthTurns() - 1;
    const capped = applyAction(long, { type: "rest" }).state;
    expect(capped.finance.length).toBe(BALANCE.economy.historyMonths);
    expect(capped.finance[capped.finance.length - 1]?.month).toBe(capped.months);
  });

  test("the payday lands in the bank, minus the subscriptions", () => {
    const state = inHand("payday");
    shipFeature(state, 10);
    state.upgrades.marketing = 1;
    state.sprintTurn = monthTurns() - 1;
    const before = state.money;

    const { state: after, events } = applyAction(state, { type: "rest" });
    const closed = eventsOfType(events, "month_closed");
    expect(closed.length).toBe(1);
    const bonus = UPGRADES.marketing.perLevel.mrrBonusPct ?? 0;
    const expectedRevenue = Math.floor((10 * (100 + bonus)) / 100);
    expect(closed[0]?.revenue).toBe(expectedRevenue);
    expect(closed[0]?.upkeep).toBe(UPGRADES.marketing.upkeep);
    expect(after.money).toBe(before + expectedRevenue - UPGRADES.marketing.upkeep);
    expect(after.moneyEarned).toBe(expectedRevenue);
  });

  test("past the servers' capacity the excess earns nothing and production notices", () => {
    const state = inHand("outage");
    const capacity = BALANCE.economy.infra.baseCapacity;
    // Twice the users production serves, in one feature.
    shipFeature(state, 100, capacity * 2);
    state.sprintTurn = monthTurns() - 1;

    const report = monthlyReport(state, gatherEffects(state));
    expect(report.load).toBe(capacity * 2);
    expect(report.overPct).toBe(100);
    expect(report.revenue).toBe(Math.floor(report.mrr / 2));
    expect(report.lost).toBe(report.mrr - report.revenue);

    const { state: after, events } = applyAction(state, { type: "rest" });
    expect(eventsOfType(events, "outage")[0]?.overPct).toBe(100);
    // Per ten percent over the tolerance, so growing past the servers hurts
    // more, and the same share hurts the same at every order of magnitude.
    const { outageQualityPer10Pct, outageTolerancePct } = BALANCE.economy.infra;
    expect(after.quality).toBe(
      state.quality + outageQualityPer10Pct * Math.ceil((report.overPct - outageTolerancePct) / 10),
    );

    // A quarter over is lost revenue and nothing else.
    const tolerated = inHand("tolerated");
    shipFeature(tolerated, 100, Math.floor((capacity * (100 + outageTolerancePct)) / 100));
    tolerated.sprintTurn = monthTurns() - 1;
    const mild = applyAction(tolerated, { type: "rest" });
    expect(eventsOfType(mild.events, "outage").length).toBe(1);
    expect(mild.state.quality).toBe(tolerated.quality);

    const served = structuredClone(state);
    served.upgrades.servers = 8;
    expect(monthlyReport(served, gatherEffects(served)).lost).toBeLessThan(report.lost);
  });
});

describe("the shop", () => {
  test("an upgrade is offered only when it can be paid for, and costs no turn", () => {
    const state = inHand("shop");
    state.money = 0;
    expect(getAvailableActions(state).some(isType("buy"))).toBe(false);

    const rich = structuredClone(state);
    rich.money = upgradeCost("servers", 0) ?? 0;
    const buy = getAvailableActions(rich).find((a) => a.type === "buy" && a.id === "servers");
    expect(buy).toBeDefined();
    if (buy === undefined) return;
    expect(getActionPreview(rich, buy).consumesTurn).toBe(false);

    const after = applyAction(rich, buy).state;
    expect(after.turn).toBe(rich.turn);
    expect(after.money).toBe(0);
    expect(after.upgrades.servers).toBe(1);
    expect(gatherEffects(after).infraCapacity).toBe(UPGRADES.servers.perLevel.infraCapacity ?? 0);
  });

  test("a coffee machine raises the ceiling at once", () => {
    const state = inHand("coffee");
    state.money = 1000;
    const after = applyAction(state, { type: "buy", id: "coffee_machine" }).state;
    expect(after.player.energyMax).toBe(state.player.energyMax + 3);
  });

  test("a skill point costs more each time, and buys a point", () => {
    const state = inHand("points");
    state.money = 1000;
    const first = skillPointPrice(state);
    expect(first).toBe(BALANCE.economy.skillPoint.price);

    const once = applyAction(state, { type: "buy_point" }).state;
    expect(once.skillPoints).toBe(state.skillPoints + 1);
    expect(once.money).toBe(1000 - first);
    expect(skillPointPrice(once)).toBeGreaterThan(first);

    const broke = structuredClone(once);
    broke.money = skillPointPrice(once) - 1;
    expect(getAvailableActions(broke).some(isType("buy_point"))).toBe(false);
  });

  test("buying moves nothing but the money: same board, same rolls", () => {
    const state = inHand("pure-shop");
    state.money = 500;
    const bought = applyAction(state, { type: "buy", id: "ide_licence" }).state;

    const plain = play(state, { pick: policy("craft"), limit: 10 });
    const shopped = play(bought, { pick: policy("craft"), limit: 10 });
    const rolls = (events: typeof plain.events) =>
      eventsOfType(events, "roll").map((e) => e.rolled);
    expect(rolls(shopped.events)).toEqual(rolls(plain.events));
  });
});
