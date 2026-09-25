import { describe, expect, test } from "bun:test";

import {
  arcKeyframes,
  arcPoint,
  ballCount,
  cssColour,
  FLIGHT_MS,
  lossSegment,
} from "@/components/hud/gaugeFxMath";

/** The arithmetic of the HUD's effects: a few balls, a lifted arc, the piece a gauge loses. */
describe("the HUD's effects", () => {
  test("a figure is worth a few balls, more when larger, never a swarm", () => {
    expect(ballCount(0)).toBe(0);
    expect(ballCount(1)).toBeGreaterThanOrEqual(1);
    expect(ballCount(1_000_000)).toBeLessThanOrEqual(6);
    expect(ballCount(-5)).toBe(ballCount(5));
    expect(ballCount(100)).toBeGreaterThan(ballCount(1));
  });

  test("the arc starts at the figure, ends on the gauge, and lifts in between", () => {
    const from = { x: 0, y: 100 };
    const to = { x: 200, y: 0 };
    expect(arcPoint(from, to, 0)).toEqual(from);
    expect(arcPoint(from, to, 1).x).toBeCloseTo(to.x);
    expect(arcPoint(from, to, 1).y).toBeCloseTo(to.y);
    expect(arcPoint(from, to, 0.5, 60).y).toBeLessThan(50);
    const frames = arcKeyframes(from, to, 4);
    expect(frames[0]).toEqual({ x: 0, y: 0 });
    expect(frames.at(-1)?.x).toBeCloseTo(200);
    expect(FLIGHT_MS).toBeLessThan(650);
  });

  test("a drop loses the piece between the two levels, and a rise loses nothing", () => {
    expect(lossSegment(80, 50)).toEqual({ left: 50, width: 30 });
    expect(lossSegment(50, 80)).toBeNull();
    expect(lossSegment(120, -10)).toEqual({ left: 0, width: 100 });
    expect(cssColour(0x05ab0f)).toBe("#05ab0f");
  });
});
