import { describe, expect, test } from "bun:test";

import { DEV_RANK, UPGRADES, upgradeCost, upgradeUnlocked } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { capacityOf, mrrOf } from "@/game/core/rules/economy";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { maxSeats } from "@/game/core/rules/team";
import type { RunState } from "@/game/core/types";

import { eventsOfType, inHand } from "./helpers";

/**
 * The ladder: what a tier unlocks, what a rung costs after the last one,
 * what a product does to the revenue, and what a site brings with it.
 */

function buys(state: RunState): string[] {
  return getAvailableActions(state).flatMap((a) => (a.type === "buy" ? [a.id] : []));
}

function hires(state: RunState): string[] {
  return getAvailableActions(state).flatMap((a) => (a.type === "hire" ? [a.rank] : []));
}

function atTier(seed: string, tier: number, money: number): RunState {
  const state = inHand(seed);
  state.tier = tier;
  state.money = money;
  return state;
}

describe("prices", () => {
  test("a rung costs more each level and never runs out", () => {
    const first = upgradeCost("servers", 0) ?? 0;
    const tenth = upgradeCost("servers", 9) ?? 0;
    expect(first).toBe(UPGRADES.servers.price.base);
    expect(tenth).toBe(Math.round(first * UPGRADES.servers.price.growth ** 9));
    expect(upgradeCost("death_star", 100)).toBeGreaterThan(0);
  });

  test("a bounded upgrade has no price past its last level", () => {
    expect(upgradeCost("mobile_app", 1)).toBeUndefined();
    expect(upgradeCost("ai_supervisor", 3)).toBeUndefined();
    expect(upgradeCost("ai_supervisor", 2)).toBe(100_000);
  });
});

describe("tiers gate the shop", () => {
  test("a rung above the run's tier is neither offered nor buyable, whatever the money", () => {
    const state = atTier("locked", 0, 1e9);
    expect(upgradeUnlocked("datacenter", 0)).toBe(false);
    const offered = buys(state);
    expect(offered).toContain("servers");
    expect(offered).not.toContain("datacenter");
    expect(offered).not.toContain("coworking");
    const preview = getActionPreview(state, { type: "buy", id: "datacenter" });
    expect(preview.blocked?.key).toBe("notes.tier_locked");
    expect(() => applyAction(state, { type: "buy", id: "datacenter" })).toThrow();
  });

  test("reaching the tier opens the rung", () => {
    const state = atTier("open", 1, 1e9);
    const offered = buys(state);
    expect(offered).toContain("datacenter");
    expect(offered).toContain("mobile_app");
    expect(offered).toContain("coworking");
    expect(offered).not.toContain("region");
  });

  test("a rank is hired from its tier", () => {
    const state = atTier("rank", 0, 1e9);
    expect(hires(state)).toEqual(["junior"]);
    expect(getActionPreview(state, { type: "hire", rank: "senior" }).blocked?.key).toBe(
      "notes.tier_locked",
    );
    state.tier = DEV_RANK.senior.tier;
    expect(hires(state)).toEqual(["junior", "mid", "senior"]);
  });
});

describe("what the money buys", () => {
  test("a datacenter serves ten times a server, autoscaling a quarter of everything", () => {
    const state = atTier("cap", 1, 1e9);
    const before = capacityOf(gatherEffects(state));
    const servers = applyAction(state, { type: "buy", id: "servers" }).state;
    expect(capacityOf(gatherEffects(servers)) - before).toBe(100);
    const dc = applyAction(state, { type: "buy", id: "datacenter" }).state;
    expect(capacityOf(gatherEffects(dc)) - before).toBe(1000);
    const scaled = applyAction(dc, { type: "buy", id: "autoscaling" }).state;
    expect(capacityOf(gatherEffects(scaled))).toBe(
      Math.floor(capacityOf(gatherEffects(dc)) * 1.25),
    );
  });

  test("a product adds half the base revenue, once", () => {
    const state = atTier("product", 1, 1e9);
    const shipped = Object.values(state.tickets).find((ticket) => ticket.kind === "feature");
    if (shipped === undefined) throw new Error("expected a feature ticket");
    shipped.status = "merged";
    shipped.mrr = 100;
    const base = mrrOf(state, gatherEffects(state));
    expect(base).toBeGreaterThan(0);
    const app = applyAction(state, { type: "buy", id: "mobile_app" }).state;
    expect(mrrOf(app, gatherEffects(app))).toBe(Math.floor(base * 1.5));
    expect(upgradeCost("mobile_app", app.upgrades.mobile_app ?? 0)).toBeUndefined();
  });

  test("a site opens seats and its team walks in, hired for free and on the payroll", () => {
    const state = atTier("site", 1, 1e9);
    expect(maxSeats(gatherEffects(state))).toBe(BALANCE.team.baseSeats);
    const { state: after, events } = applyAction(state, { type: "buy", id: "coworking" });
    const site = UPGRADES.coworking;
    expect(maxSeats(gatherEffects(after))).toBe(
      BALANCE.team.baseSeats + (site.perLevel.teamSeats ?? 0),
    );
    expect(after.devs.length).toBe(state.devs.length + (site.hires?.count ?? 0));
    expect(after.devs.every((dev) => dev.rank === "junior")).toBe(true);
    const hired = eventsOfType(events, "hired");
    expect(hired.length).toBe(site.hires?.count ?? 0);
    expect(hired.every((event) => event.source === "coworking")).toBe(true);
    expect(state.money - after.money).toBe(upgradeCost("coworking", 0) ?? 0);
  });

  test("the supervisor climbs three levels, each an order of magnitude dearer", () => {
    const state = atTier("boss", 0, 1e9);
    let current = state;
    for (let level = 1; level <= 3; level++) {
      current = applyAction(current, { type: "buy", id: "ai_supervisor" }).state;
      expect(gatherEffects(current).autopilot).toBe(level);
    }
    expect(
      getAvailableActions(current).some((a) => a.type === "buy" && a.id === "ai_supervisor"),
    ).toBe(false);
  });
});
