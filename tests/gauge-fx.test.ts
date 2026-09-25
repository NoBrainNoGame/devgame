import { describe, expect, test } from "bun:test";

import {
  ballCount,
  cssColour,
  easeInOutCubic,
  FLIGHT_MS,
  growth,
  lossSegment,
  MAX_BALLS,
  pathOf,
  pointOn,
  rgba,
  staggerOf,
} from "@/components/hud/gaugeFxMath";
import { stepGauge } from "@/game/bridge/gaugeCues";
import { gameStore } from "@/game/bridge/store";
import { STORY } from "@/game/render/storyboard";

/** The arithmetic of the HUD's effects: a ball per unit, a path of its own, an early swell. */
describe("the HUD's effects", () => {
  test("a ball per unit, up to a handful; money by its order of magnitude", () => {
    expect(ballCount("energy", 0)).toBe(0);
    expect(ballCount("energy", 3)).toBe(3);
    expect(ballCount("points", -5)).toBe(5);
    expect(ballCount("patience", 400)).toBe(MAX_BALLS);
    expect(ballCount("money", 27)).toBeLessThan(ballCount("money", 27_000_000));
    expect(ballCount("money", 1e12)).toBeLessThanOrEqual(MAX_BALLS);
  });

  test("the last ball of the largest figure lands inside the story's flight", () => {
    const last = staggerOf(MAX_BALLS - 1, MAX_BALLS) + FLIGHT_MS.max;
    expect(last).toBeLessThanOrEqual(STORY.flight);
    expect(staggerOf(0, 5)).toBe(0);
    expect(staggerOf(4, 5)).toBeGreaterThan(staggerOf(1, 5));
  });

  test("every path starts at the figure and ends on the gauge, and two draws bend it apart", () => {
    const from = { x: 0, y: 400 };
    const to = { x: 300, y: 0 };
    const left = pathOf(from, to, 0.1, 0.5);
    const right = pathOf(from, to, 0.9, 0.5);
    expect(pointOn(left, 0)).toEqual(from);
    expect(pointOn(left, 1).x).toBeCloseTo(to.x);
    expect(pointOn(left, 1).y).toBeCloseTo(to.y);
    // Bent to opposite sides of the straight line, the two midpoints are far apart.
    const a = pointOn(left, 0.5);
    const b = pointOn(right, 0.5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
  });

  test("a ball swells early, in and out, and flies at full size after that", () => {
    expect(growth(0)).toBe(0);
    expect(growth(0.2)).toBeCloseTo(0.5);
    expect(growth(0.4)).toBe(1);
    expect(growth(0.9)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
    expect(rgba(0xff8000, 0.5)).toBe("rgba(255, 128, 0, 0.5)");
  });

  test("the gauge fills ball by ball, and the last ball lands the figure", () => {
    gameStore.setState({
      heldGauges: { batch: 7, values: { energy: 10 }, points: {}, applied: {} },
    });
    const cue = { gauge: "energy" as const, delta: 4, value: 14, serial: 1 };
    stepGauge(7, cue, 1, 4);
    expect(gameStore.getState().heldGauges?.values.energy).toBe(11);
    stepGauge(7, cue, 3, 4);
    expect(gameStore.getState().heldGauges?.values.energy).toBe(13);
    // Another batch's ball moves nothing.
    stepGauge(8, cue, 4, 4);
    expect(gameStore.getState().heldGauges?.values.energy).toBe(13);
    gameStore.setState({ heldGauges: null });
  });

  test("a drop loses the piece between the two levels, and a rise loses nothing", () => {
    expect(lossSegment(80, 50)).toEqual({ left: 50, width: 30 });
    expect(lossSegment(50, 80)).toBeNull();
    expect(lossSegment(120, -10)).toEqual({ left: 0, width: 100 });
    expect(cssColour(0x05ab0f)).toBe("#05ab0f");
  });
});
