import { existsSync, openSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * What the local scripts share: running a command, waiting for the Postgres
 * container, and keeping the admin panel alive in the background with a pid
 * file, so `bun run init` and `bun run db:up` can start it and
 * `bun run admin:stop` can find it again.
 */

export const CONTAINER = "devgame-postgres";
export const ADMIN_PID = resolve(process.cwd(), ".admin.pid");
export const ADMIN_LOG = resolve(process.cwd(), ".admin.log");

export async function run(
  command: string[],
  options: { allowFailure?: boolean } = {},
): Promise<number> {
  console.log(`$ ${command.join(" ")}`);
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  const code = await child.exited;
  if (code !== 0 && options.allowFailure !== true) {
    throw new Error(`${command[0]} exited with ${code}. Fix that, then run the command again.`);
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

export async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if ((await healthOf(CONTAINER)) === "healthy") return;
    await Bun.sleep(1000);
  }
  throw new Error(
    `${CONTAINER} did not become healthy in a minute. \`docker compose logs postgres\` says why.`,
  );
}

/** Whether Docker answers at all; the error says what to do when it does not. */
export async function requireDocker(): Promise<void> {
  // Quiet: `docker info` prints a page of plugins before it says the daemon is down.
  const probe = Bun.spawn(["docker", "info"], { stdout: "ignore", stderr: "ignore" });
  if ((await probe.exited) !== 0) {
    throw new Error(
      "Docker is not running. Start Docker Desktop (or the daemon), then run the command again.",
    );
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The admin panel's pid when it is running, null otherwise. */
export async function adminPid(): Promise<number | null> {
  if (!existsSync(ADMIN_PID)) return null;
  const pid = Number((await readFile(ADMIN_PID, "utf8")).trim());
  if (!Number.isInteger(pid) || !alive(pid)) {
    await unlink(ADMIN_PID).catch(() => undefined);
    return null;
  }
  return pid;
}

/**
 * Starts `bun scripts/admin.ts` detached, its output in `.admin.log`, its
 * pid in `.admin.pid`. Idempotent: an admin already running is left alone.
 */
export async function startAdminInBackground(port: number): Promise<void> {
  const running = await adminPid();
  if (running !== null) {
    console.log(`Admin panel already running (pid ${running}): http://127.0.0.1:${port}`);
    return;
  }
  const log = openSync(ADMIN_LOG, "a");
  const child = Bun.spawn(["bun", "scripts/admin.ts"], {
    stdout: log,
    stderr: log,
    stdin: "ignore",
  });
  child.unref();
  await writeFile(ADMIN_PID, String(child.pid));
  console.log(
    `Admin panel started (pid ${child.pid}): http://127.0.0.1:${port} — log in .admin.log`,
  );
}

export async function stopAdmin(): Promise<boolean> {
  const pid = await adminPid();
  if (pid === null) return false;
  process.kill(pid, "SIGTERM");
  await unlink(ADMIN_PID).catch(() => undefined);
  return true;
}
