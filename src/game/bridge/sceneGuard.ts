/**
 * Keeping a picture on screen when the graphics stack gives way.
 *
 * A WebGL context can be lost at any time — a driver reset, a GPU shared with
 * too many tabs — and a scene can also fail to start or throw in a frame. The
 * run itself lives in the session and never goes down with the picture: only
 * the scene is rebuilt. After `SCENE_RETRY.limit` failures inside
 * `windowMs`, WebGL is given up for the rest of the page load and the graph
 * is drawn by Pixi's Canvas2D renderer; if that fails as often, there is no
 * picture at all and the HUD alone carries the game.
 *
 * Pure: the clock, the timer and the scene factory are injected, so every
 * path is tested without a browser. Rendering, not rules: nothing here is a
 * balance number.
 */

export type RenderMode = "webgl" | "canvas" | "none";

export const SCENE_RETRY = { limit: 3, windowMs: 10_000, delayMs: 250 } as const;

/** The failures still inside the window, plus this one. */
export function recordFailure(
  history: readonly number[],
  now: number,
  windowMs: number = SCENE_RETRY.windowMs,
): number[] {
  return [...history.filter((at) => now - at < windowMs), now];
}

/** Where a run of failures leaves the renderer: one step down once the limit is reached. */
export function modeAfter(mode: RenderMode, history: readonly number[]): RenderMode {
  if (history.length < SCENE_RETRY.limit) return mode;
  return mode === "webgl" ? "canvas" : "none";
}

/** A built scene. `mode` is what the renderer turned out to be, not what was asked. */
export interface SceneInstance {
  readonly mode: Exclude<RenderMode, "none">;
  destroy(): void;
}

/** How a live scene says it has failed. Late calls from a scene already replaced are ignored. */
export type SceneReport = (reason: string) => void;

/** What survives a remount: once WebGL is given up, it stays given up until the page reloads. */
export interface SceneMemory {
  webglGivenUp: boolean;
}

export const pageSceneMemory: SceneMemory = { webglGivenUp: false };

export interface SceneSupervisorDeps<T extends SceneInstance> {
  build(mode: Exclude<RenderMode, "none">, report: SceneReport): Promise<T>;
  /** Every change of state: a scene up (`instance`), or none for now or for good. */
  onChange(mode: RenderMode, instance: T | null): void;
  now(): number;
  /** Runs `fn` after `ms`; returns a cancel. */
  schedule(fn: () => void, ms: number): () => void;
  memory: SceneMemory;
}

export class SceneSupervisor<T extends SceneInstance> {
  private mode: RenderMode;
  private history: number[] = [];
  private current: T | null = null;
  /** Bumped by every attempt and every failure: a stale build or report sees it moved on. */
  private generation = 0;
  private disposed = false;
  private cancelRetry: (() => void) | null = null;

  constructor(private readonly deps: SceneSupervisorDeps<T>) {
    this.mode = deps.memory.webglGivenUp ? "canvas" : "webgl";
  }

  get renderMode(): RenderMode {
    return this.mode;
  }

  get scene(): T | null {
    return this.current;
  }

  /** Builds the first scene. Resolves once it is up, or once a retry is scheduled. */
  start(): Promise<void> {
    return this.attempt();
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.current?.destroy();
    this.current = null;
  }

  private async attempt(): Promise<void> {
    this.cancelRetry = null;
    if (this.disposed) return;
    if (this.mode === "none") {
      this.deps.onChange("none", null);
      return;
    }
    this.generation += 1;
    const generation = this.generation;
    let instance: T;
    try {
      instance = await this.deps.build(this.mode, (reason) => this.fail(generation, reason));
    } catch {
      this.fail(generation, "init");
      return;
    }
    // Disposed meanwhile, or a failure already moved on: this scene is nobody's.
    if (this.disposed || generation !== this.generation) {
      instance.destroy();
      return;
    }
    this.current = instance;
    // Asked for WebGL and got Canvas2D: the browser has none to give.
    if (this.mode === "webgl" && instance.mode === "canvas") this.giveUpWebgl();
    this.deps.onChange(this.mode, instance);
  }

  private fail(generation: number, _reason: string): void {
    if (this.disposed || generation !== this.generation) return;
    this.generation += 1;
    this.current?.destroy();
    this.current = null;

    this.history = recordFailure(this.history, this.deps.now());
    const next = modeAfter(this.mode, this.history);
    if (next !== this.mode) {
      if (next === "canvas") this.giveUpWebgl();
      else this.mode = next;
      this.history = [];
    }
    this.deps.onChange(this.mode, null);
    if (this.mode === "none") return;
    this.cancelRetry = this.deps.schedule(() => void this.attempt(), SCENE_RETRY.delayMs);
  }

  private giveUpWebgl(): void {
    this.mode = "canvas";
    this.deps.memory.webglGivenUp = true;
  }
}
