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

  test("main is the anchor, one merge per feature, and the tail", () => {
    const { featuresPerSprint } = BALANCE.map;

    for (let i = 0; i < 200; i++) {
      const state = newRun(`len-${i}`);
      const main = Object.values(state.nodes).filter((node) => node.lane === 0);

      expect(main.length).toBe(state.sprintLength);
      expect(state.sprintLength).toBeGreaterThanOrEqual(featuresPerSprint.min + 3);
      expect(state.sprintLength).toBeLessThanOrEqual(featuresPerSprint.max + 3);

      // Nothing is written on the trunk. Every node there is a merge or an end.
      for (const node of main) {
        expect(["sprint_start", "feature_merge", "sprint_merge", "release"]).toContain(node.kind);
      }
    }
  });

  test("no commit is ever made on main", () => {
    for (let i = 0; i < 200; i++) {
      const commits = sprintNodes(`trunk-${i}`).filter((node) => node.kind === "commit");
      expect(commits.length).toBeGreaterThan(0);
      for (const node of commits) {
        expect(node.lane).not.toBe(0);
        expect(node.branchId).toBeDefined();
      }
    }
  });

  test("every sprint offers real choices, not a corridor", () => {
    for (let i = 0; i < 200; i++) {
      const nodes = sprintNodes(`choice-${i}`);
      const branching = nodes.filter((node) => node.next.length > 1);
      expect(branching.length).toBeGreaterThan(0);
    }
  });

  test("every merge offers a choice of features, and some of them carry a skill", () => {
    for (let i = 0; i < 100; i++) {
      const state = newRun(`feature-${i}`);
      const features = Object.values(state.branches).filter((branch) => branch.kind === "feature");
      expect(features.length).toBeGreaterThan(0);
      expect(features.some((branch) => branch.skillId !== undefined)).toBe(true);

      // Every node on main that is not an end offers at least two features.
      for (const node of Object.values(state.nodes)) {
        if (node.lane !== 0) continue;
        if (node.kind === "sprint_merge" || node.kind === "release") continue;
        if (node.kind === "feature_merge" && node.next.length === 1) continue;
        expect(node.next.length).toBeGreaterThanOrEqual(BALANCE.map.featureOptions.min);
      }
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

  test("a feature is delivered by its merge commit, not by its last commit", () => {
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
        if (!branch.open && !branch.merged) continue;

        const mergeResolved = played.state.nodes[branch.mergeInto]?.status === "done";
        checked += 1;
        expect(branch.merged).toBe(mergeResolved);
        expect(branch.open).toBe(!mergeResolved);
      }
    }

    expect(checked).toBeGreaterThan(20);
  });
});
