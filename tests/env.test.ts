import { describe, expect, test } from "bun:test";

import { parseEnvironment } from "@/lib/env";

/**
 * Two valid shapes, and nothing in between. The offline shape is what lets
 * someone clone the repository and play without a database; the online shape
 * is what a deploy needs, and half of it must fail at boot rather than at the
 * first request that reaches the missing piece.
 */
describe("environment", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  test("nothing at all is the offline instance", () => {
    const env = parseEnvironment({});
    expect(env.ONLINE).toBe(false);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  test("blank lines count as unset", () => {
    const env = parseEnvironment({ DATABASE_URL: "", BETTER_AUTH_SECRET: "  " });
    expect(env.ONLINE).toBe(false);
  });

  test("a database needs the secrets that guard it, and the error names them", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://x" })).toThrow(
      /BETTER_AUTH_SECRET is required[\s\S]*DAILY_SEED_SECRET is required/,
    );
  });

  test("a short secret is refused even offline", () => {
    expect(() => parseEnvironment({ CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  test("the full configuration is the online instance", () => {
    const env = parseEnvironment({
      DATABASE_URL: "postgresql://x",
      BETTER_AUTH_SECRET: secret,
      DAILY_SEED_SECRET: secret,
    });
    expect(env.ONLINE).toBe(true);
    expect(env.CRON_SECRET).toBeUndefined();
  });
});
