import { describe, expect, test } from "bun:test";

import { TICKET_KIND } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants, headOf } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import {
  buggedOn,
  childrenOf,
  currentTicket,
  isReady,
  obstaclesOf,
  treeNodeIds,
} from "@/game/core/rules/tickets";
import type { PlayerAction, RunState } from "@/game/core/types";

import { eventsOfType, findSeed, inHand, type PlayResult, play, policy } from "./helpers";

/**
 * An obstacle is what a commit turns up on the way: a ticket born open, in
 * the hand of whoever was writing, forked off the feature and landing back
 * on it, and holding the feature's pull request until it has. Its points are
 * its own; its bugs are the feature's.
 */

const spawned = (result: PlayResult): boolean =>
  eventsOfType(result.events, "obstacle_spawned").length > 0;

/** A run played by hand until the first obstacle turns up, stopped there. */
function atSpawn(prefix: string): PlayResult {
  return findSeed(spawned, {
    prefix,
    pick: policy("craft"),
    limit: 80,
    stop: (_state, events) => events.some((e) => e.type === "obstacle_spawned"),
  });
}

function obstacleInHand(state: RunState) {
  const ticket = currentTicket(state);
  if (ticket === null || ticket.parentId === undefined) throw new Error("no obstacle in hand");
  const parent = state.tickets[ticket.parentId];
  if (parent === undefined) throw new Error("no parent");
  return { ticket, parent };
}

describe("an obstacle turning up", () => {
  test("is born open, in your hand, forked off the feature, and holds it", () => {
    const { state, events } = atSpawn("spawn");
    const event = eventsOfType(events, "obstacle_spawned")[0];
    if (event === undefined) throw new Error("no spawn");
    const { ticket, parent } = obstacleInHand(state);

    expect(ticket.id).toBe(event.ticketId);
    expect(ticket.kind).toBe("obstacle");
    expect(ticket.status).toBe("open");
    expect(parent.id).toBe(event.parentId);
    expect(TICKET_KIND[parent.kind].spawnsObstacles).toBe(true);
    expect(ticket.points).toBeGreaterThanOrEqual(BALANCE.tickets.kinds.obstacle.points.min);
    expect(ticket.points).toBeLessThanOrEqual(BALANCE.tickets.kinds.obstacle.points.max);
    expect(ticket.mrr).toBe(0);
    expect(ticket.nameKey).toMatch(/^obstacles\.\d+\.name$/);
    // The commit that turned it up is the feature's, and HEAD stands on it
    // until the obstacle writes its own.
    expect(parent.nodeIds).toContain(event.nodeId);
    expect(headOf(state).id).toBe(parent.nodeIds[parent.nodeIds.length - 1] ?? "");
    expect(obstaclesOf(state, parent).map((o) => o.id)).toEqual([ticket.id]);
    expect(isReady(state, { ...parent, filled: parent.points })).toBe(false);
    expect(checkInvariants(state)).toEqual([]);
  });

  test("writes in its own column off the feature's tip, and never on dev", () => {
    const { state } = atSpawn("fork");
    const { parent } = obstacleInHand(state);
    const craft = getAvailableActions(state).find(
      (a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined,
    );
    if (craft === undefined) throw new Error("cannot write");
    const after = applyAction(state, craft).state;
    const ticket = currentTicket(after);
    if (ticket === null) throw new Error("hand emptied");
    if (ticket.nodeIds.length === 0) return; // the roll missed: nothing to inspect
    const first = after.nodes[ticket.nodeIds[0] ?? ""];
    expect(first?.parents[0]).toBe(parent.nodeIds[parent.nodeIds.length - 1] ?? "");
    expect(first?.lane).not.toBe(parent.lane);
    expect(first?.lane).toBeGreaterThanOrEqual(2);
    expect(checkInvariants(after)).toEqual([]);
  });

  test("lands back on the feature with a merge in the feature's column, and hands you the feature back", () => {
    const { state } = atSpawn("land");
    const { ticket, parent } = obstacleInHand(state);
    const scoreBefore = state.pointsDelivered;
    const xpBefore = state.xpEarned;

    // Write it by hand until it is full, then land it.
    const filled = play(state, {
      pick: (s, actions) => {
        const merge = actions.find((a) => a.type === "merge");
        if (merge !== undefined) return merge;
        return actions.find(
          (a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined,
        );
      },
      limit: 40,
      stop: (s) => s.tickets[ticket.id]?.status === "merged" || s.phase.kind === "game_over",
    });
    const after = filled.state;
    const landed = after.tickets[ticket.id];
    if (landed?.status !== "merged") return; // burnt out first: a fair outcome, nothing to inspect
    const cleared = eventsOfType(filled.events, "obstacle_cleared")[0];
    expect(cleared?.ticketId).toBe(ticket.id);
    expect(cleared?.parentId).toBe(parent.id);

    const merge = after.nodes[landed.mergeNodeId ?? ""];
    expect(merge?.kind).toBe("obstacle_merge");
    expect(merge?.lane).toBe(after.tickets[parent.id]?.lane);
    expect(merge?.ticketId).toBe(parent.id);
    expect(merge?.parents).toHaveLength(2);
    expect(after.tickets[parent.id]?.nodeIds).toContain(merge?.id ?? "");
    expect(after.player.ticketId).toBe(parent.id);
    expect(obstaclesOf(after, after.tickets[parent.id] ?? parent)).toEqual([]);
    // Nothing delivered: an obstacle is a wall, not a reward.
    expect(after.pointsDelivered).toBe(scoreBefore);
    expect(after.xpEarned).toBe(xpBefore);
    expect(after.tickets[parent.id]?.filled).toBe(parent.filled);
    expect(checkInvariants(after)).toEqual([]);
  });

  test("offers merge, never submit, on a full obstacle; the feature waits for it", () => {
    const { state } = atSpawn("actions");
    const { ticket, parent } = obstacleInHand(state);
    const full = structuredClone(state);
    const own = full.tickets[ticket.id];
    const feature = full.tickets[parent.id];
    if (own === undefined || feature === undefined) throw new Error("lost");
    own.filled = own.points;
    feature.filled = feature.points;
    // The obstacle needs a commit of its own to land: plant one on it.
    const tip = feature.nodeIds[feature.nodeIds.length - 1] ?? "";
    const id = `${full.sprint}:${full.nextNodeSerial}`;
    full.nextNodeSerial += 1;
    own.lane = 9;
    full.nodes[id] = {
      id,
      sprint: full.sprint,
      kind: "commit",
      lane: 9,
      depth: full.nextDepth,
      parents: [tip],
      ticketId: own.id,
      commit: { mode: "craft", reviewed: true },
      subjectKey: "subjects.feat.t0.0",
    };
    full.nextDepth += 1;
    own.nodeIds = [id];

    const types = getAvailableActions(full).map((a) => a.type);
    expect(types).toContain("merge");
    expect(types).not.toContain("submit");

    // Back on the feature, full but held: no pull request to open.
    const held = applyAction(full, { type: "checkout", ticketId: feature.id }).state;
    expect(getAvailableActions(held).map((a) => a.type)).not.toContain("submit");
    expect(checkInvariants(full)).toEqual([]);
  });

  test("its bugs are the feature's: a review of the feature reads its commits", () => {
    const { state } = atSpawn("bugs");
    const { ticket, parent } = obstacleInHand(state);
    const planted = structuredClone(state);
    const feature = planted.tickets[parent.id];
    const own = planted.tickets[ticket.id];
    if (feature === undefined || own === undefined) throw new Error("lost");
    const tip = feature.nodeIds[feature.nodeIds.length - 1] ?? "";
    const id = `${planted.sprint}:${planted.nextNodeSerial}`;
    planted.nextNodeSerial += 1;
    own.lane = 9;
    planted.nodes[id] = {
      id,
      sprint: planted.sprint,
      kind: "commit",
      lane: 9,
      depth: planted.nextDepth,
      parents: [tip],
      ticketId: own.id,
      commit: { mode: "ai", reviewed: false, bugged: true },
      subjectKey: "subjects.chore.t0.0",
    };
    planted.nextDepth += 1;
    own.nodeIds = [id];

    expect(treeNodeIds(planted, feature)).toContain(id);
    expect(buggedOn(planted, feature)).toEqual([id]);
    expect(checkInvariants(planted)).toEqual([]);
  });

  test("never turns up on an obstacle, a hotfix or a customer's bug, and never twice at once", () => {
    for (const kind of ["obstacle", "hotfix", "client_bug", "debt", "refactor"] as const) {
      expect(TICKET_KIND[kind].spawnsObstacles).toBe(false);
    }
    for (let i = 0; i < 40; i += 1) {
      const result = play(inHand(`cap-${i}`), { pick: policy("craft"), limit: 120 });
      const state = result.state;
      for (const ticket of Object.values(state.tickets)) {
        expect(obstaclesOf(state, ticket).length).toBeLessThanOrEqual(1);
        expect(childrenOf(state, ticket).length).toBeLessThanOrEqual(
          BALANCE.tickets.kinds.obstacle.maxPerTicket,
        );
        if (ticket.parentId !== undefined) {
          expect(state.tickets[ticket.parentId]?.parentId).toBeUndefined();
        }
      }
      expect(checkInvariants(state)).toEqual([]);
    }
  });
});

describe("an obstacle on the team's ticket", () => {
  test("is the developer's, is worked first, and their feature waits for it", () => {
    const result = findSeed(
      (r) =>
        eventsOfType(r.events, "obstacle_spawned").some((e) => {
          const parent = r.state.tickets[e.parentId];
          return (
            parent?.assignee !== undefined || r.state.tickets[e.ticketId]?.assignee !== undefined
          );
        }),
      {
        prefix: "team-obstacle",
        pick: (state, actions) => {
          const hire = actions.find((a) => a.type === "hire" && a.rank === "senior");
          return hire ?? policy("craft")(state, actions);
        },
        limit: 120,
        attempts: 200,
        stop: (state, events) =>
          events.some(
            (e) =>
              e.type === "obstacle_spawned" && state.tickets[e.ticketId]?.assignee !== undefined,
          ),
      },
    );
    const state = result.state;
    const event = eventsOfType(result.events, "obstacle_spawned").find(
      (e) => state.tickets[e.ticketId]?.assignee !== undefined,
    );
    if (event === undefined) throw new Error("no team obstacle");
    const obstacle = state.tickets[event.ticketId];
    const parent = state.tickets[event.parentId];
    if (obstacle === undefined || parent === undefined) throw new Error("lost");
    expect(obstacle.assignee).toBe(parent.assignee);
    expect(state.player.ticketId).not.toBe(obstacle.id);

    // Left to the team, the obstacle lands on the feature and the feature on dev.
    const rest: PlayerAction = { type: "rest" };
    let after = state;
    for (let i = 0; i < 12 && after.tickets[obstacle.id]?.status === "open"; i += 1) {
      if (after.phase.kind !== "choose_action") break;
      after = applyAction(after, rest).state;
    }
    if (after.tickets[obstacle.id]?.status !== "merged") return;
    const cleared = eventsOfType(result.events, "obstacle_cleared");
    expect(cleared.every((e) => e.ticketId !== obstacle.id || e.devId !== undefined)).toBe(true);
    const merge = after.nodes[after.tickets[obstacle.id]?.mergeNodeId ?? ""];
    expect(merge?.commit.author).toBe(parent.assignee ?? "");
    expect(checkInvariants(after)).toEqual([]);
  });
});
