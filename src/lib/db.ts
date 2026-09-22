import "@/lib/server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * A single PrismaClient per process. Next.js dev reloads modules on every edit,
 * so without this the connection pool grows until Postgres refuses new clients.
 *
 * Prisma 7 requires a driver adapter; `PrismaPg` owns the `pg` connection pool.
 *
 * Offline — no `DATABASE_URL` — there is no client. What is exported instead
 * throws, with a message that says why, on the first property anyone reads:
 * every caller is meant to check `env.ONLINE` first, and one that forgets
 * fails loudly rather than hanging on a connection that will never open.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (env.DATABASE_URL === undefined) return offlineClient();

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function offlineClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      // Awaiting the proxy itself must not throw: a `then` lookup is how the
      // runtime asks whether something is a promise.
      if (property === "then") return undefined;
      throw new Error(
        "The database is not configured: this instance runs offline (no DATABASE_URL). " +
          "Guard the call with `env.ONLINE`, or set DATABASE_URL to run with a server.",
      );
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
