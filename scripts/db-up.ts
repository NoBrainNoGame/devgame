import { env } from "@/lib/env";

import { requireDocker, run, startAdminInBackground, waitForPostgres } from "./lib/local";

/**
 * `bun run db:up`: the Postgres container, then the admin panel beside it,
 * in the background. What `bun run init` does on a machine that already
 * has its `.env`.
 */
async function main(): Promise<void> {
  await requireDocker();
  await run(["docker", "compose", "up", "-d"]);
  await waitForPostgres();
  if (env.ADMIN_PASSWORD === undefined) {
    console.log(
      "No ADMIN_PASSWORD in .env: the admin panel stays off. Add one and `bun run admin`.",
    );
    return;
  }
  await startAdminInBackground(env.ADMIN_PORT);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
