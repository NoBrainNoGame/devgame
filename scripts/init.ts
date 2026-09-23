import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Sets a fresh machine up for the online version of the site.
 *
 *   bun run init                 write .env with dev values, start Postgres, migrate
 *   bun run init --offline       write .env for the offline game only, no Docker
 *   bun run init --no-docker     write .env, skip Docker and the migrations
 *   bun run init --force         overwrite an existing .env
 *
 * The values are for development on this machine and nothing else: a local
 * Postgres from `docker-compose.yml`, secrets drawn at random, no OAuth. The
 * variables mirror `src/lib/env.ts`, which is the one place that decides what
 * the app reads; `tests/init.test.ts` parses what this writes through it.
 */

const ENV_PATH = resolve(process.cwd(), ".env");
const CONTAINER = "devgame-postgres";
const DEFAULT_PORT = "5443";

export interface InitOptions {
  offline: boolean;
  docker: boolean;
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
`;
}

async function run(command: string[], options: { allowFailure?: boolean } = {}): Promise<number> {
  console.log(`$ ${command.join(" ")}`);
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  const code = await child.exited;
  if (code !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${command[0]} exited with ${code}. Fix that, then run \`bun run init\` again.`,
    );
  }
  return code;
}

async function healthOf(container: string): Promise<string> {
  const child = Bun.spawn(
    ["docker", "inspect", "--format", "{{.State.Health.Status}}", container],
    { stdout: "pipe", stderr: "pipe" },
  );
  const text = await new Response(child.stdout).text();
  await child.exited;
  return text.trim();
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await healthOf(CONTAINER)) === "healthy") return;
    await Bun.sleep(1000);
  }
  throw new Error(
    `${CONTAINER} did not become healthy in a minute. \`docker compose logs postgres\` says why.`,
  );
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

  const probe = await run(["docker", "info"], { allowFailure: true });
  if (probe !== 0) {
    throw new Error(
      "Docker is not running. Start Docker Desktop (or the daemon), then `bun run init` again; the .env is already written.",
    );
  }
  await run(["docker", "compose", "up", "-d"]);
  console.log(`Waiting for ${CONTAINER} to be healthy…`);
  await waitForPostgres();
  // `migrate deploy`, not `migrate dev`: it applies the migrations in the
  // repository as they are, hand-written partial index included, and asks
  // nothing.
  await run(["bun", "x", "prisma", "migrate", "deploy"]);
  await run(["bun", "x", "prisma", "generate"]);
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
