import { describe, expect, test } from "bun:test";

import { createDeadline, unlimitedDeadline } from "@/lib/utils/deadline";

/** A controllable clock, so these tests never actually wait. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe("createDeadline", () => {
  test("reports the full budget before any time passes", () => {
    const clock = fakeClock();
    const deadline = createDeadline(5_000, clock.now);

    expect(deadline.remaining()).toBe(5_000);
    expect(deadline.expired()).toBe(false);
  });

  test("counts down as the clock advances", () => {
    const clock = fakeClock();
    const deadline = createDeadline(5_000, clock.now);

    clock.advance(2_000);
    expect(deadline.remaining()).toBe(3_000);
    expect(deadline.expired()).toBe(false);
  });

  test("expires exactly at the budget, not after it", () => {
    const clock = fakeClock();
    const deadline = createDeadline(5_000, clock.now);

    clock.advance(5_000);
    expect(deadline.expired()).toBe(true);
    expect(deadline.remaining()).toBe(0);
  });

  test("clamps remaining at zero rather than going negative", () => {
    const clock = fakeClock();
    const deadline = createDeadline(1_000, clock.now);

    clock.advance(60_000);
    expect(deadline.remaining()).toBe(0);
  });

  test("refuses a budget that is not positive", () => {
    expect(() => createDeadline(0)).toThrow(/positive/);
    expect(() => createDeadline(-1)).toThrow(/positive/);
  });
});

describe("unlimitedDeadline", () => {
  test("never expires, so scripts are not cut short", () => {
    const deadline = unlimitedDeadline();
    expect(deadline.expired()).toBe(false);
    expect(deadline.remaining()).toBe(Number.POSITIVE_INFINITY);
  });
});
