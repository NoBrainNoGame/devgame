import { describe, expect, test } from "bun:test";

import {
  modeAfter,
  type RenderMode,
  recordFailure,
  SCENE_RETRY,
  type SceneInstance,
  type SceneMemory,
  type SceneReport,
  SceneSupervisor,
} from "@/game/bridge/sceneGuard";

/**
 * The scene guard: a lost or failed scene is rebuilt, three failures inside
 * ten seconds step down from WebGL to Canvas2D, three more to no picture at
 * all, and a scene that is no longer current never counts.
 */

describe("the failure window", () => {
  test("keeps what is inside the window and drops the rest", () => {
    expect(recordFailure([0, 5_000], 12_000)).toEqual([5_000, 12_000]);
    expect(recordFailure([], 3)).toEqual([3]);
  });

  test("steps down once the limit is reached, and not before", () => {
    expect(modeAfter("webgl", [1, 2])).toBe("webgl");
    expect(modeAfter("webgl", [1, 2, 3])).toBe("canvas");
    expect(modeAfter("canvas", [1, 2, 3])).toBe("none");
  });
});

interface FakeScene extends SceneInstance {
  report: SceneReport;
  destroyed: boolean;
}

function harness(
  options: {
    memory?: SceneMemory;
    fail?: (mode: string) => boolean;
    realMode?: "webgl" | "canvas";
  } = {},
) {
  let clock = 0;
  const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  const built: FakeScene[] = [];
  const changes: { mode: RenderMode; live: boolean }[] = [];
  const memory = options.memory ?? { webglGivenUp: false };
  const pending: ((scene: FakeScene) => void)[] = [];
  let deferred = false;

  const supervisor = new SceneSupervisor<FakeScene>({
    build: (mode, report) => {
      if (options.fail?.(mode) === true) return Promise.reject(new Error("init"));
      const scene: FakeScene = {
        mode: options.realMode ?? mode,
        report,
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };
      built.push(scene);
      if (deferred) return new Promise((resolve) => pending.push(() => resolve(scene)));
      return Promise.resolve(scene);
    },
    onChange: (mode, instance) => changes.push({ mode, live: instance !== null }),
    now: () => clock,
    schedule: (fn, ms) => {
      const timer = { at: clock + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    memory,
  });

  const advance = async (ms: number): Promise<void> => {
    clock += ms;
    for (const timer of [...timers]) {
      if (!timer.cancelled && timer.at <= clock) {
        timer.cancelled = true;
        timer.fn();
      }
    }
    await Promise.resolve();
    await Promise.resolve();
  };

  return {
    supervisor,
    built,
    changes,
    memory,
    advance,
    defer: () => {
      deferred = true;
    },
    resolvePending: async () => {
      for (const resolve of pending.splice(0)) resolve(undefined as never);
      await Promise.resolve();
    },
  };
}

describe("the supervisor", () => {
  test("rebuilds after a loss and stays on WebGL for two losses in the window", async () => {
    const h = harness();
    await h.supervisor.start();
    h.built[0]?.report("context_lost");
    await h.advance(SCENE_RETRY.delayMs);
    h.built[1]?.report("context_lost");
    await h.advance(SCENE_RETRY.delayMs);
    expect(h.built.length).toBe(3);
    expect(h.built[0]?.destroyed).toBe(true);
    expect(h.supervisor.renderMode).toBe("webgl");
    expect(h.changes.at(-1)).toEqual({ mode: "webgl", live: true });
  });

  test("a third loss in ten seconds moves to Canvas2D, and remembers it", async () => {
    const h = harness();
    await h.supervisor.start();
    for (let i = 0; i < 3; i += 1) {
      h.built.at(-1)?.report("context_lost");
      await h.advance(SCENE_RETRY.delayMs);
    }
    expect(h.supervisor.renderMode).toBe("canvas");
    expect(h.built.at(-1)?.mode).toBe("canvas");
    expect(h.memory.webglGivenUp).toBe(true);

    const next = harness({ memory: h.memory });
    await next.supervisor.start();
    expect(next.built[0]?.mode).toBe("canvas");
  });

  test("failures spread over more than ten seconds never give up", async () => {
    const h = harness();
    await h.supervisor.start();
    for (let i = 0; i < 6; i += 1) {
      h.built.at(-1)?.report("context_lost");
      await h.advance(6_000);
    }
    expect(h.supervisor.renderMode).toBe("webgl");
  });

  test("a failed start counts, and three of them in Canvas2D leave no picture", async () => {
    const h = harness({ fail: () => true });
    await h.supervisor.start();
    for (let i = 0; i < 6; i += 1) await h.advance(SCENE_RETRY.delayMs);
    expect(h.supervisor.renderMode).toBe("none");
    expect(h.changes.at(-1)).toEqual({ mode: "none", live: false });
  });

  test("a loss reported by a scene already replaced is ignored", async () => {
    const h = harness();
    await h.supervisor.start();
    const first = h.built[0];
    first?.report("context_lost");
    await h.advance(SCENE_RETRY.delayMs);
    first?.report("context_lost");
    first?.report("context_lost");
    await h.advance(SCENE_RETRY.delayMs);
    expect(h.built.length).toBe(2);
    expect(h.supervisor.renderMode).toBe("webgl");
  });

  test("a browser with no WebGL lands in Canvas2D at once", async () => {
    const h = harness({ realMode: "canvas" });
    await h.supervisor.start();
    expect(h.supervisor.renderMode).toBe("canvas");
    expect(h.memory.webglGivenUp).toBe(true);
  });

  test("a scene that arrives after dispose is destroyed", async () => {
    const h = harness();
    h.defer();
    const started = h.supervisor.start();
    h.supervisor.dispose();
    await h.resolvePending();
    await started;
    expect(h.built[0]?.destroyed).toBe(true);
    expect(h.changes).toEqual([]);
  });
});
