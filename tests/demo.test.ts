import { describe, expect, test } from "bun:test";

import { chooseDemo, DEMO_MAX_ACTIONS, DEMO_SESSION, demoDone } from "@/game/bridge/demo";
import { GameSession } from "@/game/bridge/session";
import { toSnapshot } from "@/game/bridge/snapshot";
import { gameStore } from "@/game/bridge/store";
import { checkInvariants } from "@/game/core/map/graph";

/**
 * The landing page plays this run for real, so it has to be a run that goes
 * somewhere: the first release on the graph within the cap, machine commits on
 * it, and a graph the invariants accept at every step.
 */
describe("the landing page's run", () => {
  test("reaches its first release, with both hands on the graph", () => {
    const session = new GameSession(DEMO_SESSION);
    for (let played = 0; played < DEMO_MAX_ACTIONS; played += 1) {
      const snapshot = toSnapshot(session.getState());
      if (demoDone(snapshot, played)) break;
      const action = chooseDemo(snapshot, played);
      if (action === undefined) throw new Error(`nothing to play at action ${played}`);
      const result = session.dispatch(action);
      if (!result.ok) throw new Error(`action ${played} refused: ${result.reason}`);
      // Headless there is no scene to play the effects: the queue that would
      // release the session is stood in for here.
      gameStore.setState({ pendingAnimation: false });
      checkInvariants(session.getState());
    }

    const state = session.getState();
    expect(state.sprint).toBeGreaterThanOrEqual(2);
    expect(state.phase.kind).not.toBe("game_over");

    const modes = new Set(Object.values(state.nodes).map((node) => node.commit.mode));
    expect(modes.has("craft")).toBe(true);
    expect(modes.has("ai")).toBe(true);
    expect(Object.values(state.nodes).some((node) => node.kind === "release")).toBe(true);
    session.destroy();
  });
});
