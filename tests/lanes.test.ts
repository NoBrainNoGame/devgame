import { describe, expect, test } from "bun:test";

import { DEV_LANE, FIRST_FEATURE_LANE, MAIN_LANE } from "@/game/core/map/layout";
import { nodeX, nodeY } from "@/game/render/coords";
import { edgePath, laneSegments } from "@/game/render/lanes";
import { CORNER, LANE_WIDTH } from "@/game/render/theme";

/**
 * The geometry of the graph, read without a renderer: a fork leaves the
 * trunk sideways on the trunk's row, a merge arrives sideways on the row it
 * lands on, and a branch's line runs between its own commits and nowhere
 * else.
 */
describe("edges", () => {
  test("a fork leaves dev on dev's row and travels in the feature column", () => {
    const path = edgePath({ lane: DEV_LANE, depth: 3 }, { lane: FIRST_FEATURE_LANE, depth: 5 });
    expect(path.length).toBe(3);
    const [out, corner, up] = path;
    expect(out?.kind).toBe("line");
    expect(out?.y1).toBe(nodeY(3));
    expect(out?.y2).toBe(nodeY(3));
    expect(corner?.kind).toBe("arc");
    expect(up?.kind).toBe("line");
    expect(up?.x1).toBe(nodeX(FIRST_FEATURE_LANE));
    expect(up?.x2).toBe(nodeX(FIRST_FEATURE_LANE));
    expect(up?.y2).toBe(nodeY(5));
  });

  test("a merge arrives on dev's row, square, whichever way the edge is given", () => {
    const forward = edgePath({ lane: FIRST_FEATURE_LANE, depth: 7 }, { lane: DEV_LANE, depth: 9 });
    const backward = edgePath({ lane: DEV_LANE, depth: 9 }, { lane: FIRST_FEATURE_LANE, depth: 7 });
    expect(forward).toEqual(backward);
    const horizontal = forward.find((s) => s.kind === "line" && s.y1 === s.y2);
    expect(horizontal?.y1).toBe(nodeY(9));
  });

  test("dev shipping into main puts the horizontal on main's row", () => {
    const path = edgePath({ lane: DEV_LANE, depth: 11 }, { lane: MAIN_LANE, depth: 12 });
    const horizontal = path.find((s) => s.kind === "line" && s.y1 === s.y2);
    expect(horizontal?.y1).toBe(nodeY(12));
    const vertical = path.find((s) => s.kind === "line" && s.x1 === s.x2);
    expect(vertical?.x1).toBe(nodeX(DEV_LANE));
  });

  test("the corner never exceeds half the gap, and a same-column edge is a plain line", () => {
    const tight = edgePath({ lane: DEV_LANE, depth: 3 }, { lane: FIRST_FEATURE_LANE, depth: 4 });
    const corner = tight.find((s) => s.kind === "arc");
    expect(corner?.kind === "arc" ? corner.r : 0).toBeLessThanOrEqual(
      Math.min(CORNER, LANE_WIDTH / 2),
    );
    const straight = edgePath({ lane: DEV_LANE, depth: 3 }, { lane: DEV_LANE, depth: 4 });
    expect(straight).toEqual([
      { kind: "line", x1: nodeX(DEV_LANE), y1: nodeY(3), x2: nodeX(DEV_LANE), y2: nodeY(4) },
    ]);
  });
});

describe("lanes", () => {
  const kinds: Record<string, "feature" | "hotfix"> = { t1: "feature", t2: "hotfix" };
  const kindOf = (id: string) => kinds[id];

  test("main with no node yet is dotted only; dev is solid between its nodes, dotted above", () => {
    const nodes = [
      { lane: DEV_LANE, depth: 0 },
      { lane: FIRST_FEATURE_LANE, depth: 1, ticketId: "t1" },
      { lane: FIRST_FEATURE_LANE, depth: 2, ticketId: "t1" },
      { lane: DEV_LANE, depth: 3 },
    ];
    const segments = laneSegments(nodes, kindOf, 4);
    expect(segments).toContainEqual({
      lane: MAIN_LANE,
      from: 0,
      to: 4,
      style: "dotted",
      colour: "trunk",
    });
    expect(segments).toContainEqual({
      lane: DEV_LANE,
      from: 0,
      to: 3,
      style: "solid",
      colour: "dev",
    });
    expect(segments).toContainEqual({
      lane: DEV_LANE,
      from: 3,
      to: 4,
      style: "dotted",
      colour: "dev",
    });
    expect(segments).toContainEqual({
      lane: FIRST_FEATURE_LANE,
      from: 1,
      to: 2,
      style: "solid",
      colour: "feature",
    });
    // Nothing solid runs ahead of a last node.
    expect(
      segments.filter((s) => s.style === "solid" && s.lane === DEV_LANE).every((s) => s.to <= 3),
    ).toBe(true);
  });

  test("two tickets that used the same column in turn are two lines, in their own colours", () => {
    const nodes = [
      { lane: DEV_LANE, depth: 0 },
      { lane: FIRST_FEATURE_LANE, depth: 1, ticketId: "t1" },
      { lane: FIRST_FEATURE_LANE, depth: 2, ticketId: "t1" },
      { lane: DEV_LANE, depth: 3 },
      { lane: FIRST_FEATURE_LANE, depth: 5, ticketId: "t2" },
      { lane: FIRST_FEATURE_LANE, depth: 6, ticketId: "t2" },
    ];
    const features = laneSegments(nodes, kindOf, 6).filter((s) => s.lane === FIRST_FEATURE_LANE);
    expect(features).toEqual([
      { lane: FIRST_FEATURE_LANE, from: 1, to: 2, style: "solid", colour: "feature" },
      { lane: FIRST_FEATURE_LANE, from: 5, to: 6, style: "solid", colour: "hotfix" },
    ]);
  });
});

describe("a feature held by an obstacle", () => {
  test("goes on dotted to the top row while the obstacle is written beside it", () => {
    const nodes = [
      { lane: 1, depth: 0, ticketId: undefined },
      { lane: 2, depth: 1, ticketId: "t1" },
      { lane: 2, depth: 2, ticketId: "t1" },
      { lane: 3, depth: 3, ticketId: "t2" },
      { lane: 3, depth: 4, ticketId: "t2" },
    ];
    const kinds: Record<string, "feature" | "obstacle"> = { t1: "feature", t2: "obstacle" };
    const plain = laneSegments(nodes, (id) => kinds[id], 4);
    expect(plain.filter((s) => s.lane === 2)).toEqual([
      { lane: 2, from: 1, to: 2, style: "solid", colour: "feature" },
    ]);
    const held = laneSegments(
      nodes,
      (id) => kinds[id],
      4,
      (id) => id === "t1",
    );
    expect(held.filter((s) => s.lane === 2)).toEqual([
      { lane: 2, from: 1, to: 2, style: "solid", colour: "feature" },
      { lane: 2, from: 2, to: 4, style: "dotted", colour: "feature" },
    ]);
    // The obstacle's own line stops at its tip, as any ticket's does.
    expect(held.filter((s) => s.lane === 3)).toEqual([
      { lane: 3, from: 3, to: 4, style: "solid", colour: "obstacle" },
    ]);
  });
});
