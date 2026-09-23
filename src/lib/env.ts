import "@/lib/server-only";

import { z } from "zod";

/**
 * Every environment variable the server reads goes through this file — nothing
 * else in the codebase touches `process.env` directly. That is what makes the
 * set of required configuration knowable by reading one module, and what lets a
 * misconfigured deploy fail at boot instead of halfway through a request.
 *
 * Adding a variable means adding it here AND to `.env.example`. If it is
 * *required online*, also add a placeholder to the `builder` stage of the
 * Dockerfile — `next build` imports this module and will otherwise fail to
 * build.
 *
 * Two shapes are valid. With no database at all the app runs **offline**: the
 * game plays against `localStorage`, and everything that needs a server — sign
 * in, the profile, cloud saves, the leaderboard — is simply not there. With a
 * database, the secrets that guard it are required, and a missing one is a
 * boot error naming it. Half a configuration is never silently accepted.
 */

/** Treats an empty string as absent, so a blank line in .env means "unset". */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const secret = (name: string) =>
  optionalString.refine((value) => value === undefined || value.length >= 16, {
    message: `${name} must be at least 16 characters`,
  });

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Absent: offline mode. Present: the server side exists and needs its secrets. */
    DATABASE_URL: optionalString,

    APP_URL: z.url().default("http://localhost:3000"),

    BETTER_AUTH_SECRET: secret("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    /** Bearer secret shared by every route under /api/cron. Absent: those routes are off. */
    CRON_SECRET: secret("CRON_SECRET"),

    /**
     * The local administration panel (`bun run admin`): the password that
     * opens it, and the port it listens on. Absent, the panel refuses to
     * start. Read here so that even a script goes through this file.
     */
    ADMIN_PASSWORD: optionalString.refine((value) => value === undefined || value.length >= 12, {
      message: "ADMIN_PASSWORD must be at least 12 characters",
    }),
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3100),

    /**
     * Keys the daily seed. Changing it changes every future daily; past dailies
     * keep the seed memoised in the `DailySeed` table, so boards stay comparable.
     */
    DAILY_SEED_SECRET: secret("DAILY_SEED_SECRET"),
  })
  .superRefine((value, context) => {
    if (value.DATABASE_URL === undefined) return;
    for (const name of ["BETTER_AUTH_SECRET", "DAILY_SEED_SECRET"] as const) {
      if (value[name] === undefined) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when DATABASE_URL is set (unset DATABASE_URL to run offline)`,
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    /** Whether a server side exists: a database, and the secrets that guard it. */
    ONLINE: value.DATABASE_URL !== undefined,
  }));

/** Exported for the tests; the app reads `env`. */
export function parseEnvironment(source: Record<string, string | undefined>) {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env = parseEnvironment(process.env);

export type Env = typeof env;
