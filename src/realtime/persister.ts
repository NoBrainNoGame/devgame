import "@/lib/server-only";

import { REALTIME_LIMITS } from "@/realtime/limits";
import type { CompanyWrite, Store, TickBatch } from "@/realtime/store";
import type { RealtimeWorld } from "@/realtime/world";

/**
 * Takes what the world changed and gets it to the store, in order, without
 * ever losing a write. A batch that cannot be committed stays in the backlog
 * and is tried again with the next one; after enough failures in a row the
 * server is told to pause its clock, because rounds played past a dead
 * database are rounds that would be lost on the next restart.
 */
export class Persister {
  private backlog: TickBatch[] = [];
  private failures = 0;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: Store,
    private readonly world: RealtimeWorld,
    private readonly callbacks: { onPause: () => void; onResume: () => void } = {
      onPause: () => undefined,
      onResume: () => undefined,
    },
  ) {}

  get pending(): number {
    return this.backlog.length;
  }

  get failed(): number {
    return this.failures;
  }

  /** Drains the world into the backlog and commits what can be. Calls queue up in order. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(() => this.run());
    return this.flushing;
  }

  private async run(): Promise<void> {
    const drained = this.world.drainWrites();
    if (drained.companies.length > 0 || drained.world !== undefined) {
      this.backlog.push({
        companies: drained.companies,
        ...(drained.world === undefined ? {} : { world: drained.world }),
      });
    }
    if (this.backlog.length === 0) return;

    const batch = merge(this.backlog);
    try {
      await this.store.commit(batch);
    } catch (error) {
      this.failures += 1;
      console.error(`realtime: write failed (${this.failures} in a row)`, error);
      if (this.failures === REALTIME_LIMITS.failedWritesBeforePause) this.callbacks.onPause();
      return;
    }
    this.backlog = [];
    if (this.failures >= REALTIME_LIMITS.failedWritesBeforePause) this.callbacks.onResume();
    this.failures = 0;
  }
}

function merge(batches: readonly TickBatch[]): TickBatch {
  const companies: CompanyWrite[] = batches.flatMap((batch) => batch.companies);
  const world = [...batches].reverse().find((batch) => batch.world !== undefined)?.world;
  return world === undefined ? { companies } : { world, companies };
}
