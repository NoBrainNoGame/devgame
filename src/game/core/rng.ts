/**
 * The only source of randomness in the game.
 *
 * `Math.random()` is banned everywhere under `src/game/core`: a run has to be
 * reproducible from `seed + actions` alone, because that is what the server
 * replays to decide whether a submitted score is real.
 *
 * The cursor is carried *in the run state* rather than closed over, so cloning
 * the state clones the random stream with it. `createRng` returns a handle that
 * writes back into that same cursor object: the rules code reads like ordinary
 * imperative code while the sequence stays a pure function of the seed and the
 * order of the calls.
 */

export interface RngState {
  /** Cursor into the stream. Advanced by one on every draw. */
  s: number;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability, expressed in percent. */
  chance(percent: number): boolean;
  /** A 1-in-100 roll, returned with the value so callers can show the dice. */
  roll(percent: number): { rolled: number; success: boolean };
  /** Uniform element. Throws on an empty array rather than returning undefined. */
  pick<T>(values: readonly T[]): T;
  /** Element chosen by weight. Weights must be non-negative and not all zero. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  /** A new shuffled array; the input is not modified. */
  shuffle<T>(values: readonly T[]): T[];
}

/** mulberry32 — small, fast, and good enough for dice. */
function mulberry32(cursor: number): number {
  let t = (cursor + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createRng(state: RngState): Rng {
  const draw = (): number => {
    state.s = (state.s + 1) | 0;
    return mulberry32(state.s);
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`rng.int: empty range [${min}, ${max}]`);
    return min + Math.floor(draw() * (max - min + 1));
  };

  return {
    next: draw,
    int,

    chance(percent) {
      // A draw is consumed even at 0 % or 100 %: skipping it would make the
      // stream depend on the odds, and the odds depend on the player's build.
      const value = draw();
      return value * 100 < percent;
    },

    roll(percent) {
      const rolled = int(1, 100);
      return { rolled, success: rolled <= percent };
    },

    pick(values) {
      if (values.length === 0) throw new Error("rng.pick: empty array");
      const value = values[int(0, values.length - 1)];
      if (value === undefined) throw new Error("rng.pick: undefined element");
      return value;
    },

    weighted(entries) {
      const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (total <= 0) throw new Error("rng.weighted: no entry has a positive weight");

      let cursor = draw() * total;
      for (const entry of entries) {
        cursor -= Math.max(0, entry.weight);
        if (cursor < 0) return entry.value;
      }

      // Only reachable through floating-point drift on the last entry.
      const last = entries[entries.length - 1];
      if (last === undefined) throw new Error("rng.weighted: empty entries");
      return last.value;
    },

    shuffle(values) {
      const out = [...values];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = out[i];
        const b = out[j];
        if (a === undefined || b === undefined) continue;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };
}
