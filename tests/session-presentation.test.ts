import { describe, expect, test } from "bun:test";

import { type AppliedPayload, GameSession } from "@/game/bridge/session";
import { gameStore, resetGameStore } from "@/game/bridge/store";
import { getAvailableActions } from "@/game/core/rules/actions";
import { emptyMeta } from "@/game/dto/meta";

/**
 * The session outlives its picture. With no scene animating — WebGL lost, or
 * given up for Canvas2D — nothing may ever be waited for; and a scene torn
 * down after a throw is detached from the run by the session itself.
 */
function session(): GameSession {
  resetGameStore();
  return new GameSession({
    seed: "presentation",
    mode: "classic",
    profileId: "junior",
    meta: emptyMeta("2026-09-25T10:00:00.000Z"),
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-25T10:00:00.000Z",
  });
}

function firstMove(run: GameSession) {
  const action = getAvailableActions(run.getState())[0];
  if (action === undefined) throw new Error("no move at turn one");
  return action;
}

describe("the session's presentation", () => {
  test("an animated run waits for its picture; an unanimated one never does", () => {
    const animated = session();
    expect(animated.dispatch(firstMove(animated)).ok).toBe(true);
    expect(gameStore.getState().pendingAnimation).toBe(true);

    const still = session();
    still.setPresentation({ animated: false });
    for (let i = 0; i < 5; i += 1) {
      expect(still.dispatch(firstMove(still)).ok).toBe(true);
      expect(gameStore.getState().pendingAnimation).toBe(false);
    }
  });

  test("tells the scene which action it applied and in which batch", () => {
    const run = session();
    run.setPresentation({ animated: false });
    const seen: AppliedPayload[] = [];
    run.on("applied", (payload) => seen.push(payload as AppliedPayload));
    const first = firstMove(run);
    run.dispatch(first);
    run.dispatch(firstMove(run));
    expect(seen[0]?.action).toEqual(first);
    expect(seen.map((payload) => payload.batch)).toEqual([1, 2]);
  });

  test("detaching drops every subscriber", () => {
    const run = session();
    run.setPresentation({ animated: false });
    let heard = 0;
    run.on("applied", () => {
      heard += 1;
    });
    run.detachListeners();
    run.dispatch(firstMove(run));
    expect(heard).toBe(0);
  });
});
