import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE, nodeSerial } from "@/game/core/map/layout";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
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

  test("main ships sprints, dev integrates features", () => {
    const { featuresPerSprint } = BALANCE.map;

    for (let i = 0; i < 200; i++) {
      const state = newRun(`len-${i}`);
      const main = Object.values(state.nodes).filter((node) => node.lane === MAIN_LANE);
      const dev = Object.values(state.nodes).filter((node) => node.lane === DEV_LANE);

      // `main` takes exactly two nodes a sprint: the merge that ships it and
      // the release that tags it. Nothing is ever written there.
      expect(main.map((node) => node.kind).sort()).toEqual(["release", "sprint_merge"]);

      // `dev` is the anchor plus one merge per feature — and that is the race.
      expect(dev.length).toBe(state.sprintLength);
      expect(state.sprintLength).toBeGreaterThanOrEqual(featuresPerSprint.min + 1);
      expect(state.sprintLength).toBeLessThanOrEqual(featuresPerSprint.max + 1);
      for (const node of dev) {
        expect(["sprint_start", "feature_merge"]).toContain(node.kind);
        expect(node.branchId).toBeUndefined();
      }
    }
  });

  test("no commit is ever made on a long-lived branch", () => {
    for (let i = 0; i < 200; i++) {
      const nodes = sprintNodes(`trunk-${i}`);
      const commits = nodes.filter((node) => node.kind === "commit");
      expect(commits.length).toBeGreaterThan(0);

      for (const node of commits) {
        expect(node.lane).toBeGreaterThanOrEqual(FIRST_FEATURE_LANE);
        expect(node.branchId).toBeDefined();
      }

      // A detour is a way of writing a commit, never a node of its own.
      for (const node of nodes) {
        expect(["refactor", "risky", "chore", "squash", "docs", "rebase"]).not.toContain(node.kind);
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

describe("what the graph can express", () => {
  test("HEAD is always on a commit that exists", () => {
    for (let i = 0; i < 40; i += 1) {
      const played = play(newRun(`head-${i}`), {
        pick: prefer(isCommit("ai"), isCommit("craft")),
        limit: 80,
      });

      const head = played.state.nodes[played.state.player.headId];
      expect(head).toBeDefined();
      // In git you stand on history. The node you are about to write does not
      // exist yet, so there is nothing there to stand on.
      expect(head?.status).toBe("done");
    }
  });

  test("a choice is always a choice between features", () => {
    for (let i = 0; i < 60; i += 1) {
      let state = newRun(`choice-shape-${i}`);

      for (let step = 0; step < 120 && state.phase.kind !== "game_over"; step += 1) {
        if (state.phase.kind === "choose_node") {
          const { candidates } = state.phase;

          // Never a list of one: a forced step is walked, not offered.
          expect(candidates.length).toBeGreaterThanOrEqual(2);

          // And every option opens a branch of its own.
          for (const id of candidates) {
            const node = state.nodes[id];
            expect(node?.branchId).toBeDefined();
            expect(node?.lane).toBeGreaterThanOrEqual(FIRST_FEATURE_LANE);
          }
        }

        const legal = getAvailableActions(state);
        const action = legal.find(isCommit("ai")) ?? legal[0];
        if (action === undefined) break;
        state = applyAction(state, action).state;
      }
    }
  });

  test("a rival lands its features on dev, never on main", () => {
    const played = play(newRun("rival-dev"), {
      pick: prefer(isCommit("craft")),
      limit: 200,
    });

    const merges = Object.values(played.state.botNodes).filter(
      (node) => node.kind === "feature_merge",
    );
    expect(merges.length).toBeGreaterThan(0);

    const devDepths = new Set<number>();
    for (const node of Object.values(played.state.nodes)) {
      if (node.lane === DEV_LANE) devDepths.add(node.depth);
    }

    for (const merge of merges) {
      expect(merge.lane).toBe(DEV_LANE);
      // `dev` is shared, so a rival's merge must not land on a row the player's
      // own merges already occupy.
      expect(devDepths.has(merge.depth)).toBe(false);
      // A merge has two parents: what the rival wrote, and the dev it landed on.
      expect(merge.parents.length).toBeGreaterThan(0);
    }
  });
});
