import "@/lib/server-only";

import { z } from "zod";

/**
 * Every environment variable the server reads goes through this file — nothing
 * else in the codebase touches `process.env` directly. That is what makes the
 * set of required configuration knowable by reading one module, and what lets a
 * misconfigured deploy fail at boot instead of halfway through a request.
 *
 * Adding a variable means adding it here AND to `.env.example`. If it is
 * *required*, also add a placeholder to the `builder` stage of the Dockerfile —
 * `next build` imports this module and will otherwise fail to build.
 */

/** Treats an empty string as absent, so a blank line in .env means "unset". */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  APP_URL: z.url().default("http://localhost:3000"),

  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  /** Bearer secret shared by every route under /api/cron. */
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  /**
   * Keys the daily seed. Changing it changes every future daily; past dailies
   * keep the seed memoised in the `DailySeed` table, so boards stay comparable.
   */
  DAILY_SEED_SECRET: z.string().min(16, "DAILY_SEED_SECRET must be at least 16 characters"),
});

function parseEnv() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env = parseEnv();

export type Env = typeof env;
