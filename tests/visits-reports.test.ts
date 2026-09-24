import { describe, expect, test } from "bun:test";

import { parseEnvironment } from "@/lib/env";
import { cleanText, filledTooFast, REPORT_LIMITS, ReportInputSchema } from "@/lib/report/validate";
import { KNOWN_PATHS, normalisePath, utcDay, VisitSchema } from "@/lib/visits/paths";

/**
 * The counter counts pages from a closed list and nothing else; a report is
 * bounded on every side and a bot fails it quietly; the admin panel wants a
 * real password.
 */
describe("the page-view counter", () => {
  test("maps every pathname to one of a closed list, and the rest to /other", () => {
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("/play")).toBe("/play");
    expect(normalisePath("/play/")).toBe("/play");
    expect(normalisePath("/legal/confidentialite")).toBe("/legal");
    expect(normalisePath("/leaderboard?mode=daily")).toBe("/other");
    expect(normalisePath("/admin")).toBe("/other");
    expect(normalisePath("/other")).toBe("/other");
    expect(normalisePath("/../etc/passwd")).toBe("/other");
    for (const path of KNOWN_PATHS) expect(KNOWN_PATHS).toContain(normalisePath(path));
  });

  test("accepts only the three bounded fields", () => {
    expect(VisitSchema.safeParse({ path: "/play", locale: "fr", first: true }).success).toBe(true);
    expect(VisitSchema.safeParse({ path: "/play", locale: "de", first: true }).success).toBe(false);
    expect(
      VisitSchema.safeParse({ path: "x".repeat(201), locale: "fr", first: false }).success,
    ).toBe(false);
    expect(VisitSchema.safeParse({ path: "/", locale: "fr" }).success).toBe(false);
  });

  test("keys the day in UTC", () => {
    expect(utcDay(new Date("2026-09-23T23:59:00Z")).toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(utcDay(new Date("2026-09-24T00:00:01Z")).toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });
});

describe("a bug report", () => {
  const good = {
    title: "The merge button does nothing",
    body: "After the review accepts the ticket, pressing Merge leaves the dialog open.",
    seed: "abc-123",
    website: "",
    startedAt: 0,
  };

  test("is accepted with bounded, cleaned text", () => {
    const parsed = ReportInputSchema.safeParse({ ...good, title: "  Hello\u0000 world  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe("Hello world");
    expect(cleanText("a\r\nb\u0007c")).toBe("a\nbc");
  });

  test("refuses what is too short, too long, or from a bot, and knows no page", () => {
    expect(ReportInputSchema.safeParse({ ...good, title: "hi" }).success).toBe(false);
    expect(
      ReportInputSchema.safeParse({ ...good, body: "x".repeat(REPORT_LIMITS.body.max + 1) })
        .success,
    ).toBe(false);
    // A report is about the game: a page named by an old client is dropped, not stored.
    const paged = ReportInputSchema.safeParse({ ...good, page: "/play" });
    expect(paged.success).toBe(true);
    if (paged.success) expect(paged.data).not.toHaveProperty("page");
    expect(ReportInputSchema.safeParse({ ...good, seed: "<script>" }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...good, website: "http://spam" }).success).toBe(false);
    expect(ReportInputSchema.safeParse({ ...good, seed: "" }).success).toBe(true);
    expect(filledTooFast({ startedAt: 10_000 }, 11_000)).toBe(true);
    expect(filledTooFast({ startedAt: 10_000 }, 10_000 + REPORT_LIMITS.minFillMs)).toBe(false);
  });
});

describe("the admin panel's configuration", () => {
  test("wants a password of some length, and a port with a default", () => {
    expect(() => parseEnvironment({ ADMIN_PASSWORD: "short" })).toThrow(/ADMIN_PASSWORD/);
    const env = parseEnvironment({ ADMIN_PASSWORD: "long-enough-password" });
    expect(env.ADMIN_PASSWORD).toBe("long-enough-password");
    expect(env.ADMIN_PORT).toBe(3100);
    expect(parseEnvironment({ ADMIN_PORT: "4000" }).ADMIN_PORT).toBe(4000);
  });
});
