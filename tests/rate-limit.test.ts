import { afterEach, describe, expect, test } from "bun:test";

import { hit, LIMITS, type RateLimit, rateKey, resetRateLimits } from "@/lib/rate-limit";

afterEach(() => {
  resetRateLimits();
});

/** A controllable clock, so these tests never actually wait a minute. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

const RULE: RateLimit = { limit: 3, windowMs: 60_000 };

describe("counting", () => {
  test("allows up to the limit and refuses the next one", () => {
    const clock = fakeClock();

    for (let i = 0; i < 3; i++) {
      expect(hit("k", RULE, clock.now).allowed).toBe(true);
    }
    expect(hit("k", RULE, clock.now).allowed).toBe(false);
  });

  test("reports what is left, floored at zero", () => {
    const clock = fakeClock();

    expect(hit("k", RULE, clock.now).remaining).toBe(2);
    expect(hit("k", RULE, clock.now).remaining).toBe(1);
    expect(hit("k", RULE, clock.now).remaining).toBe(0);
    // Still zero rather than negative: a caller renders this.
    expect(hit("k", RULE, clock.now).remaining).toBe(0);
  });

  test("counts keys separately", () => {
    const clock = fakeClock();
    for (let i = 0; i < 3; i++) hit("a", RULE, clock.now);

    expect(hit("a", RULE, clock.now).allowed).toBe(false);
    expect(hit("b", RULE, clock.now).allowed).toBe(true);
  });
});

describe("the window", () => {
  test("opens a fresh allowance once it has passed", () => {
    const clock = fakeClock();
    for (let i = 0; i < 4; i++) hit("k", RULE, clock.now);
    expect(hit("k", RULE, clock.now).allowed).toBe(false);

    clock.advance(60_001);
    expect(hit("k", RULE, clock.now).allowed).toBe(true);
  });

  test("does not reopen a moment early", () => {
    const clock = fakeClock();
    for (let i = 0; i < 3; i++) hit("k", RULE, clock.now);

    clock.advance(59_999);
    expect(hit("k", RULE, clock.now).allowed).toBe(false);
  });

  test("says when to come back", () => {
    const clock = fakeClock();
    const verdict = hit("k", RULE, clock.now);
    expect(verdict.resetAt).toBe(clock.now() + 60_000);
  });

  test("keeps the original window rather than sliding it", () => {
    // Otherwise a client hammering the endpoint keeps pushing its own reset
    // further away and never recovers.
    const clock = fakeClock();
    const first = hit("k", RULE, clock.now).resetAt;

    clock.advance(30_000);
    expect(hit("k", RULE, clock.now).resetAt).toBe(first);
  });
});

describe("who gets limited", () => {
  const request = new Request("https://cardbox.test/api/tables", {
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
  });

  test("prefers the signed-in user, which is the identity that survives", () => {
    expect(rateKey("x", { userId: "u1", guestId: "g1" }, request)).toBe("x:user:u1");
  });

  test("falls back to the guest cookie", () => {
    expect(rateKey("x", { userId: null, guestId: "g1" }, request)).toBe("x:guest:g1");
  });

  test("falls back to the address last, taking the client end of the chain", () => {
    // A household behind one NAT shares an address, which is why this is the
    // fallback and why the limits that reach it are generous.
    expect(rateKey("x", { userId: null, guestId: null }, request)).toBe("x:ip:203.0.113.7");
  });

  test("does not confuse two scopes for one identity", () => {
    expect(rateKey("a", { userId: "u1" }, request)).not.toBe(
      rateKey("b", { userId: "u1" }, request),
    );
  });

  test("still produces a key when nothing identifies the caller", () => {
    const anonymous = new Request("https://cardbox.test/x");
    expect(rateKey("x", {}, anonymous)).toBe("x:ip:unknown");
  });
});

describe("the configured limits", () => {
  test("let a fast game through", () => {
    // A hand of poker is a lot of legitimate actions in a minute; a limit that
    // interrupts play is worse than no limit.
    expect(LIMITS.saveRun.limit).toBeGreaterThanOrEqual(60);
  });

  test("are tightest where somebody else's resources are spent", () => {
    // Sign-in spends an email quota; table creation fills the database.
    expect(LIMITS.signIn.limit).toBeLessThan(LIMITS.submitRun.limit);
    expect(LIMITS.submitRun.limit).toBeLessThan(LIMITS.saveRun.limit);
  });
});
