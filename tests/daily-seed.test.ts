import { describe, expect, test } from "bun:test";

import { deriveDailySeed, msUntilNextDaily, utcDate } from "@/lib/daily/seed";

describe("daily seed", () => {
  test("is stable for a date and a secret", () => {
    expect(deriveDailySeed("2026-09-21", "secret")).toBe(deriveDailySeed("2026-09-21", "secret"));
  });

  test("differs between days", () => {
    expect(deriveDailySeed("2026-09-21", "secret")).not.toBe(
      deriveDailySeed("2026-09-22", "secret"),
    );
  });

  test("differs between secrets, which is the point of having one", () => {
    expect(deriveDailySeed("2026-09-21", "secret")).not.toBe(
      deriveDailySeed("2026-09-21", "other"),
    );
  });

  test("is sixteen hex characters", () => {
    expect(deriveDailySeed("2026-09-21", "secret")).toMatch(/^[0-9a-f]{16}$/);
  });

  test("refuses anything that is not a plain date", () => {
    expect(() => deriveDailySeed("2026-09-21T10:00:00Z", "secret")).toThrow();
    expect(() => deriveDailySeed("tomorrow", "secret")).toThrow();
  });

  test("the day boundary is midnight UTC, not local midnight", () => {
    expect(utcDate(new Date("2026-09-21T23:59:59.999Z"))).toBe("2026-09-21");
    expect(utcDate(new Date("2026-09-22T00:00:00.000Z"))).toBe("2026-09-22");
  });

  test("counts down to the next rollover", () => {
    const at = new Date("2026-09-21T23:00:00.000Z");
    expect(msUntilNextDaily(at)).toBe(60 * 60 * 1000);
  });
});
