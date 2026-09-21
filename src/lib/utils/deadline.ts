/**
 * A wall-clock budget for the ingest run.
 *
 * The cron route caps at `maxDuration = 300`; a run that blows through it is
 * killed mid-flight and recorded as FAILED even though most of its work
 * succeeded. A deadline lets the pipeline stop at a step boundary instead,
 * finish honestly, and leave the rest for the next invocation — which is safe
 * because ranked articles are persisted and consumed articles are excluded by
 * `IdeaSource`.
 */
export type Deadline = {
  /** Milliseconds left, never negative. */
  remaining(): number;
  expired(): boolean;
  /** Total budget, for logging. */
  readonly budgetMs: number;
};

export function createDeadline(budgetMs: number, now: () => number = Date.now): Deadline {
  if (budgetMs <= 0) throw new Error("Deadline budget must be positive");

  const endsAt = now() + budgetMs;

  return {
    budgetMs,
    remaining: () => Math.max(0, endsAt - now()),
    expired: () => now() >= endsAt,
  };
}

/** A budget that never expires — for scripts and tests that must not be cut short. */
export function unlimitedDeadline(): Deadline {
  return {
    budgetMs: Number.POSITIVE_INFINITY,
    remaining: () => Number.POSITIVE_INFINITY,
    expired: () => false,
  };
}
