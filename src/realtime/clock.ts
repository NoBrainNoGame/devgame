import "@/lib/server-only";

export interface ClockOptions {
  now: () => number;
  roundMs: number;
  /** Called at each due moment with the moment of the next one. */
  onTick: (nextDeadline: number) => void | Promise<void>;
  setTimer?: (run: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * A clock that keeps to an absolute schedule: tick n is due at
 * `startedAt + n × roundMs`, whatever the previous tick cost. Timers drift
 * and handlers take time; a clock that waits `roundMs` after each one would
 * lose seconds an hour, and a round that is "30 s" for everybody has to be the
 * same 30 s on the wall. If the process was stopped for longer than a round,
 * it ticks once and realigns rather than replaying the missed rounds at once.
 */
export class RoundClock {
  private readonly now: () => number;
  private readonly roundMs: number;
  private readonly onTick: (nextDeadline: number) => void | Promise<void>;
  private readonly setTimer: (run: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private startedAt = 0;
  private count = 0;
  private handle: unknown = null;
  private running = false;

  constructor(options: ClockOptions) {
    this.now = options.now;
    this.roundMs = options.roundMs;
    this.onTick = options.onTick;
    this.setTimer = options.setTimer ?? ((run, delay) => setTimeout(run, delay));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** The moment the next tick is due. */
  nextDeadline(): number {
    return this.startedAt + (this.count + 1) * this.roundMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.now();
    this.count = 0;
    this.schedule();
  }

  /** Stops ticking; `resume` carries on from the schedule. */
  stop(): void {
    this.running = false;
    if (this.handle !== null) this.clearTimer(this.handle);
    this.handle = null;
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    // Whatever was missed while stopped is not replayed: realign on the next boundary.
    this.count = Math.max(this.count, Math.floor((this.now() - this.startedAt) / this.roundMs));
    this.schedule();
  }

  isRunning(): boolean {
    return this.running;
  }

  private schedule(): void {
    if (!this.running) return;
    const delay = Math.max(0, this.nextDeadline() - this.now());
    this.handle = this.setTimer(() => void this.fire(), delay);
  }

  private async fire(): Promise<void> {
    this.handle = null;
    if (!this.running) return;
    this.count += 1;
    // Late by more than a whole round (the process slept): skip ahead, tick once.
    const behind = Math.floor((this.now() - this.startedAt) / this.roundMs);
    if (behind > this.count) this.count = behind;
    try {
      await this.onTick(this.nextDeadline());
    } catch (error) {
      console.error("realtime: a tick failed", error);
    }
    this.schedule();
  }
}
