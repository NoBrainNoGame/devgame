import { createHmac } from "node:crypto";

/**
 * The daily seed.
 *
 * Everyone gets the same map for a UTC day, which is what makes the daily board
 * comparable. Deriving it from a server secret rather than from the date alone
 * stops anyone from generating tomorrow's map and practising on it.
 *
 * `deriveDailySeed` is pure and takes its secret, so the tests can pin it. The
 * database-backed `getDailySeed` lives in `store.ts`, which is server-only.
 */

/** `YYYY-MM-DD` for a moment, in UTC. The day boundary is midnight UTC. */
export function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function deriveDailySeed(dateIso: string, secret: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error(`Expected a YYYY-MM-DD date, got ${dateIso}`);
  }
  return createHmac("sha256", secret).update(`devgame-daily:${dateIso}`).digest("hex").slice(0, 16);
}

/** Milliseconds until the daily rolls over, for the countdown on the board. */
export function msUntilNextDaily(at: Date): number {
  const next = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
  return next - at.getTime();
}
