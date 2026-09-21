import { describe, expect, test } from "bun:test";

import { chunk, mapWithConcurrency } from "@/lib/utils/concurrency";

describe("chunk", () => {
  test("splits into fixed-size groups with a short tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns nothing for an empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  test("rejects a zero size rather than looping forever", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("mapWithConcurrency", () => {
  test("preserves input order regardless of completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (delay) => {
      await Bun.sleep(delay);
      return delay;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  test("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await Bun.sleep(1);
        inFlight--;
        return null;
      },
    );

    expect(peak).toBeLessThanOrEqual(4);
  });

  test("handles more workers than items", async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (n) => n * 2);
    expect(results).toEqual([2, 4]);
  });
});
