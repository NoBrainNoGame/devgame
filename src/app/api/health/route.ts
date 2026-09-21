import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness, not readiness. The container healthcheck restarts a process that
 * fails this, so it deliberately does not touch Postgres: a database outage
 * would otherwise put every app on the box into a restart loop instead of
 * letting them serve the pages that do not need it.
 */
export function GET(): Response {
  return NextResponse.json({ ok: true, uptime: Math.round(process.uptime()) });
}
