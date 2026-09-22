import "@/lib/server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * Shared plumbing for scheduled routes. Every entry point sits behind the same
 * bearer secret, so the check lives in one place rather than being
 * re-implemented (and eventually mis-implemented) per route.
 *
 * A cron route is a public endpoint that happens to be called on a schedule.
 * Nothing about being "internal" protects it.
 */

/** Constant-time comparison so the secret can't be recovered by timing. */
function secretMatches(provided: string): boolean {
  // No secret configured means no scheduled jobs, not open ones.
  if (env.CRON_SECRET === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (header === null) return false;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || token === undefined) return false;

  return secretMatches(token);
}

/**
 * Wraps a scheduled job in the auth check and turns a thrown error into a 500
 * with a readable body, so a failing job is diagnosable from the scheduler's
 * log alone.
 */
export async function handleCronRequest<T>(
  request: Request,
  run: () => Promise<T>,
): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await run()) });
  } catch (error) {
    console.error("Scheduled job failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
