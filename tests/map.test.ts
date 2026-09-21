import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { nodeSerial } from "@/game/core/map/layout";
import type { MapNode } from "@/game/core/types";

import { isCommit, newRun, play, prefer } from "./helpers";

function sprintNodes(seed: string): MapNode[] {
  return Object.values(newRun(seed).nodes);
}

describe("sprint generation", () => {
  test("500 seeds all satisfy the structural invariants", () => {
    const broken: string[] = [];
    for (let i = 0; i < 500; i++) {
      const failures = checkInvariants(sprintNodes(`map-${i}`));
      if (failures.length > 0) broken.push(`map-${i}: ${failures[0]?.rule}`);
    }
    expect(broken).toEqual([]);
  });

  test("the main line stays inside the configured length", () => {
    for (let i = 0; i < 200; i++) {
      const state = newRun(`len-${i}`);
      expect(state.sprintLength).toBeGreaterThanOrEqual(BALANCE.sprintLength.min);
      expect(state.sprintLength).toBeLessThanOrEqual(BALANCE.sprintLength.max);

      const main = Object.values(state.nodes).filter((node) => node.lane === 0);
      expect(main.length).toBe(state.sprintLength);
    }
  });

  test("every sprint offers real choices, not a corridor", () => {
    for (let i = 0; i < 200; i++) {
      const nodes = sprintNodes(`choice-${i}`);
      const branching = nodes.filter((node) => node.next.length > 1);
      expect(branching.length).toBeGreaterThan(0);
    }
  });

  test("the first sprint always opens a feature branch", () => {
    for (let i = 0; i < 100; i++) {
      const state = newRun(`feature-${i}`);
      const features = Object.values(state.branches).filter((branch) => branch.kind === "feature");
      expect(features.length).toBeGreaterThan(0);
      for (const branch of features) expect(branch.skillId).toBeDefined();
    }
  });

  test("a feature branch merges strictly below its fork", () => {
    for (let i = 0; i < 100; i++) {
      const state = newRun(`merge-${i}`);
      for (const branch of Object.values(state.branches)) {
        const nodes = branch.nodeIds.map((id) => state.nodes[id]);
        const target = state.nodes[branch.mergeInto];
        expect(target).toBeDefined();
        for (const node of nodes) {
          expect(node).toBeDefined();
          if (node === undefined || target === undefined) continue;
          expect(node.depth).toBeLessThan(target.depth);
        }
      }
    }
  });

  test("no two branches share a column at the same depth", () => {
    for (let i = 0; i < 300; i++) {
      const failures = checkInvariants(sprintNodes(`lane-${i}`)).filter(
        (failure) => failure.rule === "lane-collision",
      );
      expect(failures).toEqual([]);
    }
  });

  test("node ids stay unique once later sprints are appended", () => {
    const { state } = play(newRun("append"), {
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 300,
      stop: (s) => s.sprint >= 3,
    });

    const ids = Object.keys(state.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map(nodeSerial)).size).toBe(ids.length);
  });

  test("appended sprints keep the graph acyclic and connected", () => {
    const { state } = play(newRun("append-2"), {
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 300,
      stop: (s) => s.sprint >= 3,
    });

    for (const node of Object.values(state.nodes)) {
      for (const nextId of node.next) {
        const next = state.nodes[nextId];
        expect(next).toBeDefined();
        if (next !== undefined) expect(next.depth).toBeGreaterThan(node.depth);
      }
    }
  });
});
