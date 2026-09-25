import { describe, expect, test } from "bun:test";

import { HEALTH_MAX, healthFloor, healthOf, healthText, patienceOf } from "@/game/bridge/gauges";
import { toSnapshot } from "@/game/bridge/snapshot";
import { BALANCE } from "@/game/core/balance";
import { signed } from "@/game/core/i18n";

import { newRun } from "./helpers";

/**
 * The HUD's gauges are full when things go well. Debt and production's
 * impatience count the other way in the engine, so the HUD turns them
 * over — without ever showing more than the engine lets it see.
 */
describe("the gauges turned over", () => {
  test("code health is the debt's band, turned over, never exact without a linter", () => {
    const blurred = healthOf({ exact: null, range: [20, 35] });
    expect(blurred).toEqual({ exact: null, range: [HEALTH_MAX - 35, HEALTH_MAX - 20] });
    expect(healthText(blurred)).toBe(`${HEALTH_MAX - 35}–${HEALTH_MAX - 20}`);

    const exact = healthOf({ exact: 30, range: [30, 30] });
    expect(exact.exact).toBe(HEALTH_MAX - 30);
    expect(healthText(exact)).toBe(String(HEALTH_MAX - 30));
  });

  test("a fresh run shows a blurred band, no exact number", () => {
    const snapshot = toSnapshot(newRun("gauges-fresh"));
    const health = healthOf(snapshot.debt);
    if (snapshot.debt.exact === null) expect(health.exact).toBeNull();
    expect(health.range[0]).toBeLessThanOrEqual(health.range[1]);
    expect(health.range[1]).toBeLessThanOrEqual(HEALTH_MAX);
  });

  test("patience is what production has left, and the floor mirrors the ceiling", () => {
    expect(patienceOf(0, 100)).toBe(100);
    expect(patienceOf(75, 100)).toBe(25);
    expect(patienceOf(130, 120)).toBe(0);
    expect(healthFloor()).toBe(BALANCE.debt.max - BALANCE.acceptance.maxDebt);
  });

  test("signed amounts use a true minus", () => {
    expect(signed(5)).toBe("+5");
    expect(signed(-5)).toBe("−5");
    expect(signed(0)).toBe("0");
  });
});
