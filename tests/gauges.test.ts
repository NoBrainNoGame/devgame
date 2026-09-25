import { describe, expect, test } from "bun:test";

import { clearHeld, releaseGauge, releaseUncued } from "@/game/bridge/gaugeCues";
import {
  type GaugeReadout,
  HEALTH_MAX,
  healthFloor,
  healthOf,
  healthText,
  holdFor,
  patienceOf,
  readout,
  shownReadout,
} from "@/game/bridge/gauges";
import { toSnapshot } from "@/game/bridge/snapshot";
import { gameStore, resetGameStore } from "@/game/bridge/store";
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

describe("holding the gauges until the canvas shows them move", () => {
  const base = (): GaugeReadout => ({
    energy: 10,
    health: { exact: null, range: [60, 75] },
    patience: 100,
    money: 500,
    skills: 2,
    points: { t1: 3 },
  });

  test("holds what changed, at its old value, and nothing else", () => {
    const prev = base();
    const next = { ...base(), energy: 8, patience: 90, points: { t1: 5 } };
    const held = holdFor(prev, next, { type: "commit" }, 4);
    expect(held).toEqual({
      batch: 4,
      values: { energy: 10, patience: 100 },
      points: { t1: 3 },
      applied: {},
    });
    expect(holdFor(prev, base(), { type: "commit" }, 5)).toBeNull();
  });

  test("a purchase shows its price at once: money and skill points are not held", () => {
    const next = { ...base(), money: 300, skills: 1 };
    expect(holdFor(base(), next, { type: "buy" }, 1)).toBeNull();
    expect(holdFor(base(), next, { type: "commit" }, 1)?.values).toEqual({ money: 500, skills: 2 });
  });

  test("cues release in order, never backwards, and only for their own batch", () => {
    resetGameStore();
    const snapshot = toSnapshot(newRun("gauges-release"));
    const live = readout(snapshot);
    gameStore.setState({
      snapshot,
      heldGauges: { batch: 7, values: { energy: live.energy + 5 }, points: {}, applied: {} },
    });
    const cue = (serial: number, value: number) => ({
      gauge: "energy" as const,
      delta: -1,
      value,
      serial,
    });

    releaseGauge(6, cue(1, live.energy + 3));
    expect(gameStore.getState().heldGauges?.values.energy).toBe(live.energy + 5);
    releaseGauge(7, cue(2, live.energy + 3));
    expect(gameStore.getState().heldGauges?.values.energy).toBe(live.energy + 3);
    releaseGauge(7, cue(1, live.energy + 4));
    expect(gameStore.getState().heldGauges?.values.energy).toBe(live.energy + 3);
    // Reaching the snapshot's own value lets the gauge go.
    releaseGauge(7, cue(3, live.energy));
    expect(gameStore.getState().heldGauges).toBeNull();
  });

  test("what no cue will move is released at once; the end of the story releases the rest", () => {
    resetGameStore();
    const snapshot = toSnapshot(newRun("gauges-uncued"));
    const live = readout(snapshot);
    gameStore.setState({
      snapshot,
      heldGauges: {
        batch: 2,
        values: { energy: live.energy + 2, patience: live.patience - 5 },
        points: {},
        applied: {},
      },
    });
    releaseUncued(2, new Set(["energy"]));
    expect(gameStore.getState().heldGauges?.values).toEqual({ energy: live.energy + 2 });
    clearHeld();
    expect(gameStore.getState().heldGauges).toBeNull();
    expect(shownReadout(live, null)).toEqual(live);
  });
});
