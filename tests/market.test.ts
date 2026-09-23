import { describe, expect, test } from "bun:test";

import { COMPETITOR_IDS, COMPETITORS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { createContext } from "@/game/core/rules/context";
import { monthlyReport, monthTurns } from "@/game/core/rules/economy";
import {
  adjustShare,
  buyStrongestCompetitor,
  competitorsAlive,
  driftMarket,
  revenueMultiplier,
  shareOf,
  startPriceWar,
} from "@/game/core/rules/market";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { hashState } from "@/game/core/run";
import type { RunState } from "@/game/core/types";

import { eventsOfType, inHand, newRun, play, policy } from "./helpers";

/**
 * The market: a share derived from what was shipped, a multiplier on the
 * revenue, competitors that enter at their tier and merge when one of them
 * dominates — and a drift that draws the same whoever is standing.
 */

function shipped(state: RunState, mrr: number, load: number): RunState {
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
    sprintArrived: 1,
    devMergesAtOpen: 0,
    nodeIds: [],
  };
  return state;
}

describe("the share", () => {
  test("is nothing with nothing shipped, and climbs with revenue and users against the rivals", () => {
    const state = newRun("share");
    expect(shareOf(state, 0, 0)).toBe(0);
    const alive = competitorsAlive(state);
    expect(alive).toEqual(COMPETITOR_IDS.filter((id) => COMPETITORS[id].entersAtTier === 0));
    const rivals = alive.reduce((sum, id) => sum + state.market.competitors[id].strength, 0);
    expect(shareOf(state, rivals, 0)).toBeCloseTo(0.5, 5);
    expect(shareOf(state, rivals, rivals * BALANCE.market.usersPerPower)).toBeCloseTo(2 / 3, 5);
    expect(shareOf(state, 1e9, 0)).toBeCloseTo(1, 5);
  });

  test("sets the revenue between sixty and a hundred and forty percent, fifteen less in a price war", () => {
    const state = newRun("multiplier");
    const { multiplier, priceWar } = BALANCE.market;
    expect(revenueMultiplier(state, 0)).toBeCloseTo(multiplier.min, 5);
    expect(revenueMultiplier(state, 1)).toBeCloseTo(multiplier.max, 5);
    expect(revenueMultiplier(state, 0.5)).toBeCloseTo((multiplier.min + multiplier.max) / 2, 5);
    const context = createContext(state);
    startPriceWar(context);
    expect(eventsOfType(context.events, "price_war").length).toBe(1);
    expect(revenueMultiplier(state, 0.5)).toBeCloseTo(
      (multiplier.min + multiplier.max) / 2 - priceWar.penalty,
      5,
    );

    // The payday reads the multiplier; the price war ends by itself.
    const paid = shipped(inHand("payday-share"), 100, 300);
    const report = monthlyReport(paid, gatherEffects(paid));
    expect(report.revenue).toBe(Math.floor(100 * report.multiplier));
    startPriceWar(createContext(paid));
    let current = paid;
    for (let month = 0; month < priceWar.months + 1; month += 1) {
      current.sprintTurn = monthTurns() - 1;
      current = applyAction(current, { type: "rest" }).state;
      if (current.phase.kind !== "choose_action") break;
    }
    expect(current.market.priceWarUntilMonth).toBeNull();
  });

  test("moves by what customers remember, and says so", () => {
    const state = newRun("remember");
    const context = createContext(state);
    adjustShare(context, 2, 100, 0);
    adjustShare(context, -1, 100, 0);
    expect(state.market.shareBonus).toBe(1);
    const changes = eventsOfType(context.events, "share_changed");
    expect(changes.map((e) => e.delta)).toEqual([2, -1]);
    expect(shareOf(state, 0, 0)).toBeCloseTo(0.01, 5);
  });
});

describe("the competitors", () => {
  test("enter at their tier, grow every month, and one merger happens somewhere in fifty seeds", () => {
    let merged = 0;
    for (let i = 0; i < 50; i += 1) {
      const state = newRun(`drift-${i}`);
      state.tier = 5;
      const before = structuredClone(state.market.competitors);
      const context = createContext(state);
      for (let month = 0; month < 24; month += 1) driftMarket(context);
      const entered = eventsOfType(context.events, "competitor_entered").map((e) => e.id);
      for (const id of COMPETITOR_IDS) {
        if (COMPETITORS[id].entersAtTier > 0) expect(entered).toContain(id);
        const now = state.market.competitors[id];
        if (now.status === "alive" && before[id]?.status === "alive") {
          expect(now.strength).toBeGreaterThan(before[id].strength);
        }
      }
      merged += eventsOfType(context.events, "competitor_merged").length;
      for (const id of COMPETITOR_IDS) {
        const competitor = state.market.competitors[id];
        if (competitor.status === "merged") {
          expect(competitor.mergedInto).toBeDefined();
          expect(
            competitor.mergedInto === undefined
              ? ""
              : state.market.competitors[competitor.mergedInto].status,
          ).toBe("alive");
        }
      }
    }
    expect(merged).toBeGreaterThan(0);
  });

  test("the strongest one standing goes with a big acquisition, and the share rises for it", () => {
    const state = inHand("buy-rival");
    state.tier = 4;
    state.money = 1e9;
    const context = createContext(state);
    driftMarket(context);
    const before = shareOf(state, 100, 0);
    const strongest = [...competitorsAlive(state)].sort(
      (a, b) => state.market.competitors[b].strength - state.market.competitors[a].strength,
    )[0];
    const { state: after, events } = applyAction(state, { type: "acquire", id: "competitor" });
    const bought = eventsOfType(events, "competitor_bought")[0];
    expect(bought?.id).toBe(strongest);
    expect(after.market.competitors[bought?.id ?? "brume"].status).toBe("bought");
    expect(shareOf(after, 100, 0)).toBeGreaterThan(before);

    // Nobody left to buy: the helper says so, and buys nothing.
    for (const id of COMPETITOR_IDS) after.market.competitors[id].status = "bought";
    expect(buyStrongestCompetitor(createContext(after))).toBeUndefined();
  });

  test("the drift draws the same for the same seed, so a run replays", () => {
    const run = play(newRun("market-replay"), { pick: policy("craft"), limit: 120 });
    let replayed = newRun("market-replay");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(hashState(replayed)).toBe(hashState(run.state));
    expect(replayed.market).toEqual(run.state.market);
  });
});
