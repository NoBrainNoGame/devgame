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
 *   bun run init                 copy .env.example to .env, start Postgres, migrate
 *   bun run init --offline       copy .env.example without the database, no Docker
 *   bun run init --no-docker     copy .env.example, skip Docker and the migrations
 *   bun run init --force         overwrite an existing .env
 *
 * With Docker, it ends by starting the local admin panel in the background
 * (`bun run admin:stop` ends it), on the port and behind the password the
 * `.env` carries.
 *
 * `.env.example` is the configuration; this script only copies it and fills
 * the secrets it leaves empty, so the two never disagree about what a
 * variable means. The values are for development on this machine and nothing
 * else: a local Postgres from `docker-compose.yml`, secrets drawn at random,
 * no OAuth. The variables mirror `src/lib/env.ts`, which is the one place
 * that decides what the app reads; `tests/init.test.ts` parses what this
 * writes through it.
 */

const ENV_PATH = resolve(process.cwd(), ".env");
const EXAMPLE_PATH = resolve(process.cwd(), ".env.example");
/** The port `.env.example` names; `POSTGRES_PORT` moves it, as it moves docker-compose.yml. */
const DEFAULT_PORT = "5443";

/** Left empty in `.env.example`, drawn at random per machine. Length: what env.ts accepts. */
const SECRETS: Readonly<Record<string, number>> = {
  BETTER_AUTH_SECRET: 32,
  CRON_SECRET: 32,
  DAILY_SEED_SECRET: 32,
  ADMIN_PASSWORD: 12,
};

export interface InitOptions {
  offline: boolean;
  docker: boolean;
  force: boolean;
  /** Where `.env` goes; the tests point it at a scratch file. */
  target: string;
  /** The `.env.example` to copy; the tests point it at a fixture. */
  example: string;
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
    example: env.DEVGAME_INIT_EXAMPLE ?? EXAMPLE_PATH,
    postgresPort: env.POSTGRES_PORT ?? DEFAULT_PORT,
  };
}

/**
 * The `.env` a developer starts from: `.env.example` line for line, except
 * that an empty secret is filled at random, the Postgres port follows
 * `POSTGRES_PORT`, and `--offline` comments the database out.
 */
export function renderEnv(
  example: string,
  options: Pick<InitOptions, "offline" | "postgresPort">,
): string {
  const lines = example.split("\n").map((line) => {
    const assignment = /^([A-Z_]+)=(.*)$/.exec(line);
    if (assignment === null) return line;
    const [, key, value] = assignment;
    if (key === undefined || value === undefined) return line;
    const bytes = SECRETS[key];
    if (bytes !== undefined && (value === "" || value === '""')) {
      return `${key}="${randomBytes(bytes).toString("hex")}"`;
    }
    if (key === "DATABASE_URL") {
      if (options.offline) return `# ${key}=${value}`;
      return `${key}=${value.replace(`localhost:${DEFAULT_PORT}`, `localhost:${options.postgresPort}`)}`;
    }
    return line;
  });
  const stamp = `# Copied from .env.example by \`bun run init\` on ${new Date().toISOString().slice(0, 10)}.`;
  return `${stamp}\n${lines.join("\n")}`;
}

/** A fresh clone has no node_modules; the Prisma CLI lives there. */
async function requireDependencies(): Promise<void> {
  if (existsSync(resolve(process.cwd(), "node_modules", "prisma"))) return;
  await run(["bun", "install", "--frozen-lockfile"]);
}

export async function init(options: InitOptions): Promise<void> {
  if (existsSync(options.target) && !options.force) {
    console.log(`${options.target} exists; left as is (pass --force to overwrite).`);
  } else {
    if (!existsSync(options.example)) {
      throw new Error(
        `${options.example} is missing; it is committed, so \`git checkout .env.example\` brings it back.`,
      );
    }
    await mkdir(dirname(options.target), { recursive: true });
    const rendered = renderEnv(await readFile(options.example, "utf8"), options);
    await writeFile(options.target, rendered, { mode: 0o600 });
    console.log(
      `Copied ${options.example} to ${options.target}${options.offline ? " (offline)" : ""}.`,
    );
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
  await requireDependencies();
  // `migrate deploy`, not `migrate dev`: it applies the migrations in the
  // repository as they are, hand-written partial index included, and asks
  // nothing. Through `bun run`, not `bun x`: `bun x prisma` on a machine
  // without node_modules fetches the newest Prisma from the registry, whose
  // CLI no longer has a `migrate` command, while `bun run` uses the version
  // the lockfile pins.
  await run(["bun", "run", "db:deploy"]);
  await run(["bun", "run", "db:generate"]);
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
