import { describe, expect, test } from "bun:test";

import { placeDetours } from "@/components/hud/detours";
import type { PlayerAction } from "@/game";
import { toSnapshot } from "@/game/bridge/snapshot";
import { BALANCE } from "@/game/core/balance";
import { applyAction } from "@/game/core/rules/reducer";
import type { RunState } from "@/game/core/types";

import { inHand, makeReady, ticketInHand } from "./helpers";

type Commit = Extract<PlayerAction, { type: "commit" }>;

/** A ticket in hand with a commit that cost debt: something for a refactor to redo. */
function indebted(seed: string): RunState {
  let state = inHand(seed);
  for (let i = 0; i < 30; i += 1) {
    state = applyAction(state, { type: "commit", mode: "ai" }).state;
    const ticket = ticketInHand(state);
    if (ticket.nodeIds.some((id) => (state.nodes[id]?.commit.debt ?? 0) > 0)) return state;
  }
  throw new Error(`${seed}: no commit cost debt in 30 tries`);
}

function detoursOf(state: RunState) {
  const snapshot = toSnapshot(state);
  const written = snapshot.actions.filter(
    (action): action is Commit => action.type === "commit" && action.kind !== undefined,
  );
  const current = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);
  return { current, ...placeDetours(written, current) };
}

describe("where the ways to write a commit sit", () => {
  test("a refactor is a way to write it instead while the pull request can open", () => {
    const { main, instead } = detoursOf(makeReady(indebted("detours-open")));
    expect(main).toEqual([]);
    expect(instead.some((action) => action.kind === "refactor")).toBe(true);
  });

  test("it is a main action when only the codebase's health keeps the pull request shut", () => {
    const ready = makeReady(indebted("detours-health"));
    ready.debt = BALANCE.acceptance.maxDebt + 10;
    const { current, main, instead } = detoursOf(ready);
    expect(current?.waitingOnHealth).toBe(true);
    // Both hands, and nowhere else.
    expect(main.map((action) => action.mode).sort()).toEqual(["ai", "craft"]);
    expect(main.every((action) => action.kind === "refactor")).toBe(true);
    expect(instead.some((action) => action.kind === "refactor")).toBe(false);
  });
});
