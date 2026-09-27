import { describe, expect, test } from "bun:test";

import { advancePushes, emptyPushes } from "@/game/bridge/pushes";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import type { MapNode, NodeId } from "@/game/core/types";
import { rowsOf } from "@/game/render/rows";

import { newRun, policy } from "./helpers";

/** Nodes at the given depths, keyed by id, with only what the rows read. */
function nodesAt(depths: Record<NodeId, number>): Record<NodeId, MapNode> {
  const nodes: Record<NodeId, MapNode> = {};
  for (const [id, depth] of Object.entries(depths)) {
    nodes[id] = { id, depth } as MapNode;
  }
  return nodes;
}

describe("rows", () => {
  test("without a squash, a row is the depth", () => {
    const nodes = nodesAt({ a: 0, b: 1, c: 2 });
    const rows = rowsOf(nodes, new Map());
    for (const node of Object.values(nodes)) expect(rows.of(node)).toBe(node.depth);
  });

  test("a squash closes its rows up: the result takes the oldest one's row", () => {
    // Local a, b, c pushed together into c; x below, y above.
    const nodes = nodesAt({ x: 2, a: 3, b: 4, c: 5, y: 6 });
    const rows = rowsOf(
      nodes,
      new Map([
        ["a", "c"],
        ["b", "c"],
      ]),
    );
    const at = (id: string) => rows.of(nodes[id] as MapNode);
    expect(at("x")).toBe(2);
    expect(at("c")).toBe(3);
    // The history above comes down with it.
    expect(at("y")).toBe(4);
    // The squashed commits are drawn where they went.
    expect(at("a")).toBe(3);
    expect(at("b")).toBe(3);
  });

  test("a commit written between two squashed ones keeps a row of its own", () => {
    // A colleague's commit at depth 4, between the player's local a and b.
    const nodes = nodesAt({ a: 3, x: 4, b: 5, c: 6 });
    const rows = rowsOf(
      nodes,
      new Map([
        ["a", "c"],
        ["b", "c"],
      ]),
    );
    const at = (id: string) => rows.of(nodes[id] as MapNode);
    expect(at("x")).toBe(3);
    expect(at("c")).toBe(4);
  });

  test("real runs leave no hole in the history, however much they squash", () => {
    let squashed = 0;
    for (let i = 0; i < 20; i += 1) {
      let state = newRun(`rows-${i}`);
      let ledger = emptyPushes();
      for (let n = 0; n < 150 && state.phase.kind !== "game_over"; n += 1) {
        const action = policy("ai")(state, getAvailableActions(state));
        if (action === undefined) break;
        const result = applyAction(state, action);
        ledger = advancePushes(ledger, result.events, result.state).ledger;
        state = result.state;
      }

      const absorbed = new Map(Object.entries(ledger.absorbed));
      squashed += absorbed.size;
      const rows = rowsOf(state.nodes, absorbed);
      const drawn = Object.values(state.nodes)
        .filter((node) => !absorbed.has(node.id))
        .map((node) => rows.of(node))
        .sort((a, b) => a - b);
      // One commit a row, and every row from the first to the last has one.
      expect(new Set(drawn).size).toBe(drawn.length);
      const first = drawn[0] ?? 0;
      drawn.forEach((row, k) => {
        expect(row).toBe(first + k);
      });
    }
    expect(squashed).toBeGreaterThan(0);
  });
});
