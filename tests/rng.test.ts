import { describe, expect, test } from "bun:test";

import { canonicalJson, fnv1a } from "@/game/core/hash";
import { createRng } from "@/game/core/rng";

describe("createRng", () => {
  test("the same cursor replays the same stream", () => {
    const a = Array.from({ length: 20 }, () => createRng({ s: 1234 }).next());
    const first = createRng({ s: 1234 });
    const second = createRng({ s: 1234 });

    expect(a.length).toBe(20);
    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  test("different cursors diverge", () => {
    const a = createRng({ s: 1 });
    const b = createRng({ s: 2 });
    expect(a.next()).not.toBe(b.next());
  });

  test("advances the cursor it was given", () => {
    const state = { s: 7 };
    createRng(state).next();
    expect(state.s).toBe(8);
  });

  test("int stays inside its inclusive bounds", () => {
    const rng = createRng({ s: 99 });
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test("int covers both ends of a two-value range", () => {
    const rng = createRng({ s: 5 });
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rng.int(0, 1));
    expect([...seen].sort()).toEqual([0, 1]);
  });

  test("chance consumes a draw even at the extremes", () => {
    const always = { s: 42 };
    createRng(always).chance(100);
    expect(always.s).toBe(43);

    const never = { s: 42 };
    createRng(never).chance(0);
    expect(never.s).toBe(43);
  });

  test("chance honours its probability", () => {
    const rng = createRng({ s: 11 });
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (rng.chance(25)) hits += 1;
    expect(hits / 4000).toBeGreaterThan(0.2);
    expect(hits / 4000).toBeLessThan(0.3);
  });

  test("roll reports the die alongside the verdict", () => {
    const rng = createRng({ s: 3 });
    for (let i = 0; i < 500; i++) {
      const { rolled, success } = rng.roll(60);
      expect(rolled).toBeGreaterThanOrEqual(1);
      expect(rolled).toBeLessThanOrEqual(100);
      expect(success).toBe(rolled <= 60);
    }
  });

  test("weighted respects the weights", () => {
    const rng = createRng({ s: 8 });
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[
        rng.weighted([
          { value: "a" as const, weight: 3 },
          { value: "b" as const, weight: 1 },
        ])
      ] += 1;
    }
    expect(counts.a / (counts.a + counts.b)).toBeGreaterThan(0.7);
    expect(counts.a / (counts.a + counts.b)).toBeLessThan(0.8);
  });

  test("weighted rejects an all-zero table", () => {
    const rng = createRng({ s: 1 });
    expect(() => rng.weighted([{ value: "a", weight: 0 }])).toThrow();
  });

  test("pick rejects an empty array rather than returning undefined", () => {
    expect(() => createRng({ s: 1 }).pick([])).toThrow();
  });

  test("shuffle keeps every element and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const frozen = [...input];
    const out = createRng({ s: 17 }).shuffle(input);

    expect(input).toEqual(frozen);
    expect([...out].sort((a, b) => a - b)).toEqual(frozen);
  });
});

describe("hashing", () => {
  test("fnv1a is stable and distinguishes inputs", () => {
    expect(fnv1a("devgame")).toBe(fnv1a("devgame"));
    expect(fnv1a("devgame")).not.toBe(fnv1a("devgane"));
  });

  test("canonicalJson sorts keys so insertion order cannot change a hash", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  test("canonicalJson drops undefined the way JSON does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
