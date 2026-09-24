import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CONTAINER,
  requireDocker,
  run,
  startAdminInBackground,
  waitForPostgres,
} from "./lib/local";

/**
 * Sets a fresh machine up for the online version of the site.
 *
 *   bun run init                 write .env with dev values, start Postgres, migrate
 *   bun run init --offline       write .env for the offline game only, no Docker
 *   bun run init --no-docker     write .env, skip Docker and the migrations
 *   bun run init --no-fixtures   leave the database empty
 *   bun run init --force         overwrite an existing .env
 *
 * With Docker, it ends by loading the development fixtures (`bun run
 * fixtures`: accounts, runs on the boards, a month of stats) and starting the
 * local admin panel in the background (`bun run admin:stop` ends it), on the
 * port and behind the password the `.env` carries.
 *
 * The values are for development on this machine and nothing else: a local
 * Postgres from `docker-compose.yml`, secrets drawn at random, no OAuth. The
 * variables mirror `src/lib/env.ts`, which is the one place that decides what
 * the app reads; `tests/init.test.ts` parses what this writes through it.
 */

const ENV_PATH = resolve(process.cwd(), ".env");
const DEFAULT_PORT = "5443";

export interface InitOptions {
  offline: boolean;
  docker: boolean;
  /** Load the development fixtures once the database is migrated. */
  fixtures: boolean;
  force: boolean;
  /** Where `.env` goes; the tests point it at a scratch file. */
  target: string;
  postgresPort: string;
}

export function parseInitArgs(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): InitOptions {
  return {
    offline: argv.includes("--offline"),
    docker: !argv.includes("--no-docker") && !argv.includes("--offline"),
    fixtures: !argv.includes("--no-fixtures"),
    force: argv.includes("--force"),
    target: env.DEVGAME_INIT_TARGET ?? ENV_PATH,
    postgresPort: env.POSTGRES_PORT ?? DEFAULT_PORT,
  };
}

/** The `.env` a developer starts from. Random secrets, local database, no OAuth. */
export function renderEnv(options: Pick<InitOptions, "offline" | "postgresPort">): string {
  const secret = (): string => randomBytes(32).toString("hex");
  const database = options.offline
    ? "# DATABASE_URL is unset: the game runs offline, against localStorage.\n# DATABASE_URL="
    : `DATABASE_URL="postgresql://devgame:devgame@localhost:${options.postgresPort}/devgame"`;

  return `# Written by \`bun run init\` on ${new Date().toISOString().slice(0, 10)} for development on this machine.
# Every variable the server reads is validated in src/lib/env.ts; that file is
# the reference for what each one means.

NODE_ENV=development

# The database is the switch: set, the server side exists and needs its secrets;
# unset, the app runs offline with a local save only.
${database}

APP_URL="http://localhost:3000"
BETTER_AUTH_URL="http://localhost:3000"

# Random per machine. Rotate BETTER_AUTH_SECRET and every session ends;
# rotate DAILY_SEED_SECRET and every future daily changes (past ones are kept).
BETTER_AUTH_SECRET="${secret()}"
CRON_SECRET="${secret()}"
DAILY_SEED_SECRET="${secret()}"

# Google OAuth is optional. Empty, the magic link printed to the server log is
# the only way to sign in.
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# The local administration panel (\`bun run admin\`, started with the database):
# its password, and the port it listens on, on this machine only.
ADMIN_PASSWORD="${secret().slice(0, 24)}"
ADMIN_PORT=3100
`;
}

export async function init(options: InitOptions): Promise<void> {
  if (existsSync(options.target) && !options.force) {
    console.log(`${options.target} exists; left as is (pass --force to overwrite).`);
  } else {
    await mkdir(dirname(options.target), { recursive: true });
    await writeFile(options.target, renderEnv(options), { mode: 0o600 });
    console.log(`Wrote ${options.target}${options.offline ? " (offline)" : ""}.`);
  }

  if (!options.docker) {
    console.log(
      options.offline
        ? "Offline: no database, nothing to start. `bun run dev` and play."
        : "Docker skipped. When Postgres is up: `bun run db:deploy`, then `bun run dev`.",
    );
    return;
  }

  await requireDocker();
  await run(["docker", "compose", "up", "-d"]);
  console.log(`Waiting for ${CONTAINER} to be healthy…`);
  await waitForPostgres();
  // `migrate deploy`, not `migrate dev`: it applies the migrations in the
  // repository as they are, hand-written partial index included, and asks
  // nothing.
  await run(["bun", "x", "prisma", "migrate", "deploy"]);
  await run(["bun", "x", "prisma", "generate"]);
  // After `generate`: the loader imports the client it produces.
  if (options.fixtures) await run(["bun", "scripts/fixtures.ts"]);
  // The panel reads the .env just written; a freshly generated file has a
  // password in it, an older one may not.
  const written = await readFile(options.target, "utf8");
  const port = Number(written.match(/^ADMIN_PORT=(\d+)/m)?.[1] ?? "3100");
  if (/^ADMIN_PASSWORD="[^"]{12,}"/m.test(written)) await startAdminInBackground(port);
  console.log(
    "Ready: `bun run dev` then http://localhost:3000. The magic link is printed to this terminal.",
  );
}

if (import.meta.main) {
  init(parseInitArgs(process.argv.slice(2), process.env)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
