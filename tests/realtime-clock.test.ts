import { describe, expect, test } from "bun:test";

import { RoundClock } from "@/realtime/clock";
import { Persister } from "@/realtime/persister";
import { MemoryStore } from "@/realtime/store";
import { RealtimeWorld } from "@/realtime/world";

/** A clock and a timer wheel the test drives by hand. */
function fake(start = 10_000) {
  let now = start;
  const timers: { at: number; run: () => void; id: number }[] = [];
  let next = 0;
  return {
    now: () => now,
    setTimer: (run: () => void, delay: number): unknown => {
      next += 1;
      timers.push({ at: now + delay, run, id: next });
      return next;
    },
    clearTimer: (handle: unknown): void => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    /** Moves time forward and fires what falls due, in order. */
    async advance(ms: number): Promise<void> {
      const target = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const first = timers[0];
        if (first === undefined || first.at > target) break;
        timers.shift();
        now = Math.max(now, first.at);
        first.run();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
    },
    jump(ms: number): void {
      now += ms;
    },
  };
}

describe("the round clock", () => {
  test("ticks on an absolute schedule, whatever a tick costs", async () => {
    const t = fake();
    const ticks: number[] = [];
    const clock = new RoundClock({
      now: t.now,
      roundMs: 1000,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      onTick: async (next) => {
        ticks.push(next);
        // The tick itself takes 300 ms: the next one is still due on the second.
        t.jump(300);
      },
    });
    clock.start();
    expect(clock.nextDeadline()).toBe(11_000);
    await t.advance(5_000);
    expect(ticks).toEqual([12_000, 13_000, 14_000, 15_000, 16_000]);
  });

  test("a process that slept ticks once and realigns, it does not replay the rounds", async () => {
    const t = fake();
    const ticks: number[] = [];
    const clock = new RoundClock({
      now: t.now,
      roundMs: 1000,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      onTick: async (next) => {
        ticks.push(next);
      },
    });
    clock.start();
    t.jump(20_500);
    await t.advance(100);
    expect(ticks).toHaveLength(1);
    // Realigned on the schedule: the next boundary after now, not twenty rounds in a row.
    expect(ticks[0]).toBe(10_000 + 21_000);
    await t.advance(1_000);
    expect(ticks).toEqual([31_000, 32_000]);
  });

  test("stops and resumes without replaying what it missed", async () => {
    const t = fake();
    const ticks: number[] = [];
    const clock = new RoundClock({
      now: t.now,
      roundMs: 1000,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      onTick: async (next) => {
        ticks.push(next);
      },
    });
    clock.start();
    await t.advance(2_000);
    clock.stop();
    await t.advance(10_000);
    expect(ticks).toHaveLength(2);
    clock.resume();
    await t.advance(1_000);
    expect(ticks).toHaveLength(3);
  });

  test("a tick that throws does not stop the clock", async () => {
    const t = fake();
    let calls = 0;
    const clock = new RoundClock({
      now: t.now,
      roundMs: 1000,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
      onTick: async () => {
        calls += 1;
        throw new Error("boom");
      },
    });
    clock.start();
    await t.advance(3_000);
    expect(calls).toBe(3);
  });
});

describe("the persister", () => {
  function world() {
    let n = 0;
    const w = new RealtimeWorld({
      now: () => 0,
      newId: () => {
        n += 1;
        return `c${n}`;
      },
      seed: "p",
    });
    w.start(1);
    return w;
  }

  test("pauses the clock after ten failures in a row and resumes when the store is back", async () => {
    const store = new MemoryStore();
    store.world = { id: "main", seed: "p", round: 0, rng: 0, lastEventRound: 0 };
    const w = world();
    let paused = 0;
    let resumed = 0;
    const persister = new Persister(store, w, {
      onPause: () => {
        paused += 1;
      },
      onResume: () => {
        resumed += 1;
      },
    });
    w.createCompany({ profileId: "a", name: "Ada" }, "Acme");
    store.failing = 10;
    for (let i = 0; i < 10; i += 1) {
      w.tick(i);
      await persister.flush();
    }
    expect(paused).toBe(1);
    expect(persister.failed).toBe(10);
    expect(persister.pending).toBeGreaterThan(0);

    w.tick(11);
    await persister.flush();
    expect(resumed).toBe(1);
    expect(persister.pending).toBe(0);
    expect(store.companies.get("c1")?.seq).toBe(w.seqOf("c1"));
    expect(store.world?.round).toBe(w.cursor().round);
  });
});
