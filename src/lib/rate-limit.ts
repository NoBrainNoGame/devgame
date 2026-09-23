/**
 * Rate limiting, in this process.
 *
 * # The same caveat as the event bus
 *
 * Counters live in a `Map` here, so **two replicas mean two allowances** and a
 * limit of 10 becomes 20. One container serves everything today, which makes
 * this correct now and wrong the moment the deployment grows — and the failure
 * is silent, which is why it is written here rather than only in a doc.
 *
 * The seam when it comes: back `hit()` with a Postgres upsert or a Redis
 * `INCR`. Nothing else has to change, because callers only ever see the verdict.
 *
 * # What it is for
 *
 * Not security. A determined attacker rotates addresses; this is here so a
 * runaway client, a stuck retry loop, or somebody idly hammering "create table"
 * cannot fill the database or spend somebody else's email quota. That is a real
 * problem and a cheap fix, and pretending it is more would be a lie.
 */

export type RateLimit = {
  /** How many are allowed in a window. */
  limit: number;
  /** How long the window lasts, in milliseconds. */
  windowMs: number;
};

export type RateVerdict = {
  allowed: boolean;
  remaining: number;
  /** When the current window ends, so a caller can send `Retry-After`. */
  resetAt: number;
};

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/**
 * Sweep expired windows so a long-running server does not accumulate one per
 * address ever seen. Cheap because it only runs when the map is large.
 */
function sweep(now: number): void {
  if (windows.size < 10_000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Count one attempt against a key.
 *
 * The clock is injected so the tests never wait, and so a caller batching work
 * can use one `now` for the whole batch.
 */
export function hit(key: string, rule: RateLimit, now: () => number = Date.now): RateVerdict {
  const at = now();
  sweep(at);

  const existing = windows.get(key);

  if (existing === undefined || existing.resetAt <= at) {
    const window: Window = { count: 1, resetAt: at + rule.windowMs };
    windows.set(key, window);
    return { allowed: true, remaining: rule.limit - 1, resetAt: window.resetAt };
  }

  existing.count += 1;

  // Counting past the limit rather than clamping: it is what tells a stuck
  // retry loop apart from a busy person, in a log.
  return {
    allowed: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Only for tests: forget every window. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Who is being limited.
 *
 * The signed-in user first, because it is the identity that actually survives;
 * then the guest cookie; then the address. An address is the weakest of the
 * three — a household behind one NAT shares it — so it is the fallback rather
 * than the rule, and the limits that use it are generous.
 */
export function rateKey(
  scope: string,
  identity: { userId?: string | null; guestId?: string | null },
  request: Request,
): string {
  if (identity.userId != null) return `${scope}:user:${identity.userId}`;
  if (identity.guestId != null) return `${scope}:guest:${identity.guestId}`;

  // `x-forwarded-for` is a list; the first entry is the client as the nearest
  // trusted proxy saw it.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:ip:${forwarded ?? request.headers.get("x-real-ip") ?? "unknown"}`;
}

/** The limits, in one place so they can be read and argued about together. */
export const LIMITS = {
  /** Autosave fires on a timer; this is well above what a fast run produces. */
  saveRun: { limit: 60, windowMs: 60_000 },
  /** Each submission replays a whole run server-side, so it costs real CPU. */
  submitRun: { limit: 10, windowMs: 60_000 },
  /** Meta sync happens on sign-in and after a run; a loop is the only way past this. */
  syncMeta: { limit: 30, windowMs: 60_000 },
  /** Somebody else's email quota is being spent here. */
  signIn: { limit: 5, windowMs: 15 * 60_000 },
  /** One page view per navigation; a browser cannot open two a second for long. */
  visit: { limit: 120, windowMs: 60_000 },
  /** A bug report is written by a person: a few an hour, not a stream. */
  report: { limit: 3, windowMs: 60 * 60_000 },
  /** The local admin panel's password prompt. */
  adminLogin: { limit: 5, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimit>;

/** A 429 that says when to come back rather than just refusing. */
export function tooManyRequests(verdict: RateVerdict): Response {
  const seconds = Math.max(1, Math.ceil((verdict.resetAt - Date.now()) / 1000));
  return Response.json(
    {
      error: {
        code: "rate-limited",
        message: `That is a lot of requests. Try again in ${seconds} seconds.`,
      },
    },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}
