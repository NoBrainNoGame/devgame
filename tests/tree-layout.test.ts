import { describe, expect, test } from "bun:test";

import {
  branchLinks,
  linkPath,
  spentOn,
  TREE_COLUMNS,
  TREE_LAYOUT,
  treeRows,
} from "@/components/hud/treeLayout";
import { hasNews, stillSeen, upgradeOffers } from "@/components/hud/upgradeOffers";
import { TREE, TREE_BRANCHES, TREE_IDS, treeBranch } from "@/game/content";
import { actionKey } from "@/game/core/rules/preview";

describe("skill tree layout", () => {
  test("every node has a cell of its own inside its branch's grid", () => {
    for (const branch of TREE_BRANCHES) {
      const taken = new Set<string>();
      for (const id of treeBranch(branch)) {
        const slot = TREE_LAYOUT[id];
        expect(slot.col).toBeGreaterThanOrEqual(0);
        expect(slot.col).toBeLessThan(TREE_COLUMNS);
        expect(slot.row).toBeGreaterThanOrEqual(0);
        const key = `${slot.col}:${slot.row}`;
        expect(taken.has(key)).toBe(false);
        taken.add(key);
      }
    }
  });

  test("a requirement stays in its branch and sits above what it unlocks", () => {
    for (const id of TREE_IDS) {
      for (const req of TREE[id].requires ?? []) {
        expect(TREE[req.id].branch).toBe(TREE[id].branch);
        expect(TREE_LAYOUT[req.id].row).toBeLessThan(TREE_LAYOUT[id].row);
      }
    }
  });

  test("no connector crosses a node on its way down", () => {
    // A connector drops from its parent, turns at the top of the child's
    // row, then drops into the child: the parent's column must be clear
    // between the two rows, or the line runs through another node.
    for (const branch of TREE_BRANCHES) {
      const cells = new Set(
        treeBranch(branch).map((id) => `${TREE_LAYOUT[id].col}:${TREE_LAYOUT[id].row}`),
      );
      for (const link of branchLinks(branch)) {
        const from = TREE_LAYOUT[link.from];
        const to = TREE_LAYOUT[link.to];
        for (let row = from.row + 1; row < to.row; row += 1) {
          expect(cells.has(`${from.col}:${row}`)).toBe(false);
        }
      }
    }
  });

  test("links are the requirements, and a path joins the two centres", () => {
    const links = TREE_BRANCHES.flatMap((branch) => branchLinks(branch));
    const requirements = TREE_IDS.flatMap((id) => TREE[id].requires ?? []);
    expect(links.length).toBe(requirements.length);
    expect(linkPath({ from: "ci", to: "review_bot", level: 2 })).toBe("M1.5 0.5 V2.5");
    expect(linkPath({ from: "ci", to: "cd", level: 1 })).toBe("M1.5 0.5 V1 H0.5 V1.5");
  });

  test("the tree is as tall as its tallest branch, and a level costs what it cost", () => {
    expect(treeRows(TREE_BRANCHES)).toBe(3);
    expect(spentOn("stamina", 0)).toBe(0);
    expect(spentOn("stamina", 3)).toBe(4);
  });
});

describe("the upgrades button", () => {
  test("offers are the points the tree takes and the upgrades the money covers", () => {
    expect(
      upgradeOffers({
        phase: { kind: "choose_action" },
        actions: [
          { type: "tree", id: "ci" },
          { type: "buy", id: "servers" },
          // A point for sale is almost always on offer; a site is bought from the team tab.
          { type: "buy_point" },
          { type: "buy", id: "coworking" },
          { type: "rest" },
        ],
      }),
    ).toEqual([actionKey({ type: "tree", id: "ci" }), actionKey({ type: "buy", id: "servers" })]);
  });

  test("a phase that sells nothing says nothing about what is affordable", () => {
    expect(
      upgradeOffers({ phase: { kind: "game_over", reason: "burnout" }, actions: [] }),
    ).toBeNull();
  });

  test("shines for an offer not seen yet, and again for one that comes back", () => {
    const ci = actionKey({ type: "tree", id: "ci" });
    const servers = actionKey({ type: "buy", id: "servers" });
    expect(hasNews([ci], new Set())).toBe(true);
    expect(hasNews([ci], new Set([ci]))).toBe(false);

    // Seen, then gone: the servers are news again when they come back.
    const seen = stillSeen(new Set([ci, servers]), [ci]);
    expect(seen.has(servers)).toBe(false);
    expect(hasNews([ci, servers], seen)).toBe(true);
    // Nothing gone, nothing new: the same set, so no re-render for nothing.
    const same = new Set([ci]);
    expect(stillSeen(same, [ci])).toBe(same);
  });
});
