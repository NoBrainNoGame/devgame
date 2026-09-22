import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { ticketsFor } from "@/game/core/map/tickets";
import { applyAction } from "@/game/core/rules/reducer";
import { sortedTickets } from "@/game/core/rules/tickets";
import { tierOf, tierScale } from "@/game/core/rules/tier";
import { createRun } from "@/game/core/run";
import { SAVE_VERSION } from "@/game/dto/version";

import { eventsOfType, inHand, settle } from "./helpers";

/**
 * Orders of magnitude: the tier ladder, the fact that it never goes down, and
 * what a feature arriving at a tier is worth against one from the start.
 */
describe("tiers", () => {
  test("the ladder is a decade a step, starting at a thousand", () => {
    const { first, growth } = BALANCE.economy.tier;
    expect(tierOf(0)).toBe(0);
    expect(tierOf(first - 1)).toBe(0);
    expect(tierOf(first)).toBe(1);
    expect(tierOf(first * growth - 1)).toBe(1);
    expect(tierOf(first * growth)).toBe(2);
    expect(tierOf(first * growth ** 4)).toBe(5);
    // The ladder ends: no amount reaches a tier past the last.
    expect(tierOf(first * growth ** 40)).toBe(BALANCE.economy.tier.last);
  });

  test("earnings reaching a threshold raise the tier once, and spending never lowers it", () => {
    const state = inHand("tier-up");
    state.moneyEarned = BALANCE.economy.tier.first - 10;
    const ticket = sortedTickets(state).find((t) => t.status === "backlog");
    if (ticket === undefined) throw new Error("expected a backlog ticket");
    ticket.status = "merged";
    ticket.mrr = 50;
    state.sprintTurn = BALANCE.sprint.turns / BALANCE.economy.monthsPerSprint - 1;

    const paid = applyAction(state, { type: "rest" });
    expect(paid.state.tier).toBe(1);
    expect(eventsOfType(paid.events, "tier_reached").map((e) => e.tier)).toEqual([1]);

    const spent = structuredClone(paid.state);
    spent.money = 0;
    const later = applyAction(spent, { type: "rest" });
    expect(later.state.tier).toBe(1);
    expect(eventsOfType(later.events, "tier_reached")).toEqual([]);
  });

  test("a feature arriving at a higher tier earns and weighs more, by the same factor per tier", () => {
    const { mrrGrowth, loadGrowth } = BALANCE.economy.tier;
    expect(tierScale(0, mrrGrowth)).toBe(1);
    expect(tierScale(2, mrrGrowth)).toBe(mrrGrowth ** 2);
    expect(tierScale(3, loadGrowth)).toBe(loadGrowth ** 3);

    // Same seed, same draws: only the tier differs, so the tickets differ by
    // exactly the scale and nothing else.
    const options = {
      seed: "tier-scale",
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    } as const;
    const base = createRun(options);
    const rich = createRun(options);
    rich.tier = 2;
    rich.sprintTurn = BALANCE.sprint.turns - 1;
    base.sprintTurn = BALANCE.sprint.turns - 1;
    // The sprint boundary passes through the relic choice before the arrivals.
    const baseNext = settle(applyAction(base, { type: "rest" }).state);
    const richNext = settle(applyAction(rich, { type: "rest" }).state);
    const arrivedBase = sortedTickets(baseNext).filter((t) => t.sprintArrived === 2);
    const arrivedRich = sortedTickets(richNext).filter((t) => t.sprintArrived === 2);
    expect(arrivedRich.length).toBe(ticketsFor(2, 2));
    expect(arrivedBase.length).toBe(ticketsFor(2, 0));
    const a = arrivedBase[0];
    const b = arrivedRich[0];
    if (a === undefined || b === undefined) throw new Error("expected arrivals");
    expect(b.points).toBe(a.points);
    expect(b.mrr).toBe(a.mrr * mrrGrowth ** 2);
    expect(b.load).toBe(a.load * loadGrowth ** 2);
    expect(b.tier).toBe(2);
  });

  test("more tickets arrive per tier, past the sprint cap", () => {
    const { maxPerSprint, perTier } = BALANCE.tickets;
    expect(ticketsFor(999, 0)).toBe(maxPerSprint);
    expect(ticketsFor(999, 3)).toBe(maxPerSprint + 3 * perTier);
  });
});
