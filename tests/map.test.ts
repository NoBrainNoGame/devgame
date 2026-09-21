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

describe("paths through a sprint", () => {
  test("every route crosses the sprint merge", () => {
    // A detour that lands on the release would skip the design's end-of-sprint
    // merge, and with it the energy the sprint boundary is supposed to give
    // back — while leaving the merge node stranded in the graph forever.
    for (let i = 0; i < 300; i++) {
      const state = newRun(`merge-path-${i}`);
      const merge = Object.values(state.nodes).find((node) => node.kind === "sprint_merge");
      const release = Object.values(state.nodes).find((node) => node.kind === "release");

      expect(merge).toBeDefined();
      expect(release).toBeDefined();
      if (merge === undefined || release === undefined) continue;

      const intoRelease = Object.values(state.nodes).filter((node) =>
        node.next.includes(release.id),
      );
      expect(intoRelease.map((node) => node.id)).toEqual([merge.id]);
    }
  });

  test("resolving a branch's last node merges it, even when nodes were skipped", () => {
    // Taking a sub-branch skips some of its parent's nodes by design. Requiring
    // every node to have been walked left the parent open for the rest of the
    // run: the skill it promised was swallowed, and `isOverextended` stayed
    // true forever, costing −15 on every roll with no way to clear it.
    //
    // Played across many seeds, always stepping onto a branch when offered, so
    // sub-branches are actually entered.
    let checked = 0;

    for (let i = 0; i < 60; i++) {
      const played = play(newRun(`sub-merge-${i}`), {
        pick: (state, actions) => {
          const onto = actions.find(
            (action) =>
              action.type === "move" && state.nodes[action.nodeId]?.branchId !== undefined,
          );
          return onto ?? actions.find(isCommit("ai")) ?? actions[0];
        },
        limit: 400,
      });

      for (const branch of Object.values(played.state.branches)) {
        if (branch.kind !== "feature" && branch.kind !== "subfeature") continue;

        const last = branch.nodeIds[branch.nodeIds.length - 1];
        if (last === undefined) continue;
        if (played.state.nodes[last]?.status !== "done") continue;

        checked += 1;
        expect(branch.merged).toBe(true);
        expect(branch.open).toBe(false);
      }
    }

    expect(checked).toBeGreaterThan(20);
  });
});
