import type { StoreApi } from "zustand/vanilla";

import type { AppliedEntryDto } from "@/game/dto/realtime";
import type { RealtimeStore } from "@/realtime/client/store";

/**
 * What the stage must offer for entries to be applied to it: the engine
 * behind the canvas, seen from the outside.
 */
export interface EntrySink {
  /** Applies one entry to the run and plays it. False when the engine refuses it. */
  applyEntry(row: AppliedEntryDto): boolean;
  /** The hash of the run's state now. */
  hash(): string;
  /** Whether the canvas is still playing the previous entry. */
  busy(): boolean;
  /** Fast-forwards the canvas to the end of what it is playing. */
  skip(): void;
}

export interface DriverOptions {
  store: StoreApi<RealtimeStore>;
  sink: EntrySink;
  /** Tell the server we lost the thread. */
  onDesync: (seq: number, hash: string) => void;
}

/**
 * Feeds the stage the entries the server sent, in order. It never applies
 * anything optimistically: a free action is sent and applied when its echo
 * arrives, a turn action when the round resolves, so every client applies the
 * same entries in the same order and holds the same state.
 *
 * A gap in the sequence, a refused entry or a hash that does not match the
 * server's means this client has drifted: it asks the server to send the
 * company again, and the stage remounts on it.
 */
export class EntryDriver {
  private draining = false;
  private desynced = false;

  constructor(private readonly options: DriverOptions) {}

  /** Applies whatever is queued. Safe to call on every store change. */
  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      this.run();
    } finally {
      this.draining = false;
    }
  }

  /** A fresh company was sent: forget the old thread. */
  reset(): void {
    this.desynced = false;
  }

  private run(): void {
    const { store, sink } = this.options;
    while (!this.desynced) {
      const state = store.getState();
      const next = state.inbox[0];
      if (next === undefined) return;

      if (next.seq <= state.appliedSeq) {
        state.dispatch({ type: "applied", seq: state.appliedSeq });
        continue;
      }
      if (next.seq !== state.appliedSeq + 1) {
        this.lose(state.appliedSeq, sink.hash());
        return;
      }

      // Another entry is on its way in while the last is still playing: the
      // viewer sees the last one end, rather than the two played over each other.
      if (sink.busy()) sink.skip();
      if (!sink.applyEntry(next) || sink.hash() !== next.hash) {
        this.lose(state.appliedSeq, sink.hash());
        return;
      }
      state.dispatch({ type: "applied", seq: next.seq });
    }
  }

  private lose(seq: number, hash: string): void {
    this.desynced = true;
    this.options.onDesync(seq, hash);
  }
}
