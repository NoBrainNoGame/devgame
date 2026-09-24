/**
 * A door that closes for longer every time the wrong key is tried.
 *
 * The first wrong password closes it for a minute; every wrong one after
 * that doubles the wait. A right one opens it and forgets the count. One
 * door for the whole panel rather than one per address: it listens on the
 * loopback only, so every caller is the same machine anyway, and a limiter
 * keyed by address would be a limiter keyed by nothing.
 */
export class Cooldown {
  private failures = 0;
  private until = 0;

  constructor(private readonly firstMs = 60_000) {}

  /** Milliseconds still to wait, zero when the door is open. */
  left(now: number): number {
    return Math.max(0, this.until - now);
  }

  /** A wrong password: the door closes, for twice as long as the last time. */
  fail(now: number): number {
    this.failures += 1;
    const wait = this.firstMs * 2 ** (this.failures - 1);
    this.until = now + wait;
    return wait;
  }

  /** A right password: the door opens and the count is forgotten. */
  succeed(): void {
    this.failures = 0;
    this.until = 0;
  }
}

/** "3 min 20 s", "45 s": what the page says to wait. */
export function describeWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
