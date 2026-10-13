import { describe, expect, test } from "bun:test";

import { hashState } from "@/game/core/run";
import { computeScore } from "@/game/core/score";

import { funded, hiringPolicy, newRun, play, policy } from "./helpers";

/**
 * The guard for the multiplayer refactor: every solo state must hash exactly
 * as it did before a company could have several players. A line failing here
 * is a solo replay that no longer lands on the same game, so it is a bug in
 * the refactor, never a number to repin. See docs/maintenance.md, "The
 * RULES_EPOCH decision".
 */
const CASES: {
  name: string;
  seed: string;
  run: "plain" | "funded";
  mode: "ai" | "craft";
  limit: number;
}[] = [
  { name: "craft", seed: "golden-1", run: "plain", mode: "craft", limit: 600 },
  { name: "ai", seed: "golden-2", run: "plain", mode: "ai", limit: 600 },
  { name: "team craft", seed: "golden-3", run: "funded", mode: "craft", limit: 600 },
  { name: "team ai", seed: "golden-4", run: "funded", mode: "ai", limit: 600 },
  { name: "long", seed: "golden-5", run: "plain", mode: "craft", limit: 1500 },
  { name: "long team", seed: "golden-6", run: "funded", mode: "ai", limit: 1500 },
];

const PINNED: Record<string, { hash: string; score: number }> = {
  craft: { hash: "b1b9e26d", score: 228 },
  ai: { hash: "d21c7cb8", score: 79 },
  "team craft": { hash: "6bd35134", score: 100 },
  "team ai": { hash: "68b53f14", score: 131 },
  long: { hash: "3f55a8c4", score: 70 },
  "long team": { hash: "9c1df7fc", score: 66 },
};

describe("solo state is frozen", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const start = c.run === "funded" ? funded(c.seed) : newRun(c.seed);
      const pick = c.run === "funded" ? hiringPolicy(c.mode) : policy(c.mode);
      const { state, actions } = play(start, { pick, limit: c.limit });
      const got = { hash: hashState(state), score: computeScore(state), actions: actions.length };
      if (process.env.GOLDEN_PRINT === "1") console.info(c.name, JSON.stringify(got));
      else {
        const pinned = PINNED[c.name];
        if (pinned === undefined) throw new Error(`${c.name}: no pin, run with GOLDEN_PRINT=1`);
        expect({ hash: got.hash, score: got.score }).toEqual(pinned);
      }
    });
  }
});
