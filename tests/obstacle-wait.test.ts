import { describe, expect, test } from "bun:test";

import { chooseAutopilot } from "@/game/bridge/autopilot";
import { idleTarget } from "@/game/bridge/idle";
import { toSnapshot } from "@/game/bridge/snapshot";
import { getAvailableActions } from "@/game/core/rules/actions";
import { createContext } from "@/game/core/rules/context";
import { applyAction } from "@/game/core/rules/reducer";
import { spawnObstacle, waitsOnlyForObstacle } from "@/game/core/rules/tickets";
import type { RunState } from "@/game/core/types";

import { inHand, makeReady, ticketInHand } from "./helpers";

/**
 * A feature whose points are full and whose only hold-up is an obstacle has
 * nothing left to write: commits that fill points are not offered on it any
 * more, while the rules keep them legal so every recorded run replays. The
 * way forward — the obstacle — is offered instead, and the idle clock takes it.
 */
function fullAndBlocked(seed: string): { state: RunState; parentId: string; obstacleId: string } {
  const state = makeReady(inHand(seed));
  const parent = ticketInHand(state);
  const nodeId = parent.nodeIds[0];
  if (nodeId === undefined) throw new Error("expected a commit on the ticket");
  const obstacle = spawnObstacle(createContext(state), parent, nodeId);
  // The obstacle takes the hand; the player goes back to the feature.
  state.player.ticketId = parent.id;
  return { state, parentId: parent.id, obstacleId: obstacle.id };
}

describe("a full ticket that only its obstacle holds back", () => {
  test("is recognised, and not before it is full", () => {
    const { state, parentId } = fullAndBlocked("wait-1");
    const parent = state.tickets[parentId];
    if (parent === undefined) throw new Error("no parent");
    expect(waitsOnlyForObstacle(state, parent)).toBe(true);
    parent.filled = parent.points - 1;
    expect(waitsOnlyForObstacle(state, parent)).toBe(false);
  });

  test("is offered no commit that fills points, though the rules still allow one", () => {
    const { state, parentId, obstacleId } = fullAndBlocked("wait-2");
    const snapshot = toSnapshot(state);
    const offered = snapshot.actions.filter((a) => a.type === "commit");
    for (const action of offered) {
      expect(action.type === "commit" && ["docs", "risky", undefined].includes(action.kind)).toBe(
        false,
      );
    }
    expect(snapshot.tickets.find((t) => t.id === parentId)?.waitingOnObstacle).toBe(true);
    expect(snapshot.actions).toContainEqual({ type: "checkout", ticketId: obstacleId });

    // Legal all the same: an old log that wrote one here still replays.
    const legal = getAvailableActions(state);
    expect(legal).toContainEqual({ type: "commit", mode: "craft" });
    expect(() => applyAction(state, { type: "commit", mode: "craft" })).not.toThrow();
  });

  test("sends the idle clock to the obstacle", () => {
    const { state, obstacleId } = fullAndBlocked("wait-3");
    const snapshot = toSnapshot(state);
    expect(chooseAutopilot(snapshot)).toEqual({ type: "checkout", ticketId: obstacleId });
    expect(idleTarget(snapshot)).toEqual({ type: "checkout", ticketId: obstacleId });
  });
});
