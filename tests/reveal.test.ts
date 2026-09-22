import { describe, expect, test } from "bun:test";

import { RevealSet } from "@/game/bridge/reveal";
import { headOf } from "@/game/core/map/graph";

import { inHand, newRun, play, policy } from "./helpers";

describe("the reveal set", () => {
  test("showAll is the engine's state: every commit, HEAD where the engine has it", () => {
    for (let i = 0; i < 20; i += 1) {
      const { state } = play(newRun(`reveal-${i}`), { pick: policy("ai"), limit: 60 });
      const reveal = new RevealSet();
      reveal.showAll(state);

      expect([...reveal.nodes].sort()).toEqual(Object.keys(state.nodes).sort());
      expect(reveal.headId).toBe(headOf(state).id);
    }
  });

  test("showNode is idempotent and moves HEAD only when asked", () => {
    const state = inHand("reveal-node");
    const reveal = new RevealSet();
    let changes = 0;
    reveal.on("changed", () => {
      changes += 1;
    });

    const [id] = Object.keys(state.nodes);
    if (id === undefined) throw new Error("expected a node");

    expect(reveal.showNode(id, false)).toBe(true);
    expect(reveal.headId).toBeNull();
    expect(reveal.showNode(id, false)).toBe(false);
    expect(changes).toBe(1);

    expect(reveal.showNode(id, true)).toBe(false);
    expect(reveal.headId).toBe(id);
    expect(changes).toBe(2);
  });

  test("showAll announces a change once, and not at all when nothing moved", () => {
    const state = inHand("reveal-once");
    const reveal = new RevealSet();
    let changes = 0;
    reveal.on("changed", () => {
      changes += 1;
    });

    reveal.showAll(state);
    reveal.showAll(state);
    expect(changes).toBe(1);
  });

  test("a snapshot is a copy: revealing more does not change it", () => {
    const state = inHand("reveal-snap");
    const reveal = new RevealSet();
    const snapshot = reveal.snapshot();
    reveal.showAll(state);
    expect(snapshot.nodes.size).toBe(0);
    expect(reveal.nodes.size).toBeGreaterThan(0);
  });
});
