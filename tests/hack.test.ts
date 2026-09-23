import { describe, expect, test } from "bun:test";

import { toSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { capacityOf } from "@/game/core/rules/economy";
import { hackOffer } from "@/game/core/rules/hack";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { hashState } from "@/game/core/run";
import type { RunState } from "@/game/core/types";

import { eventsOfType, inHand, play, policy } from "./helpers";

/**
 * The hack: offered only in a tight spot, once a sprint, a coin flip with
 * the run on the other side — and never taken by the supervisor.
 */

function offered(state: RunState): boolean {
  return getAvailableActions(state).some((a) => a.type === "hack");
}

function desperate(seed: string): RunState {
  const state = inHand(seed);
  state.quality = Math.ceil((BALANCE.quality.max * BALANCE.hack.offerAtQualityPct) / 100);
  return state;
}

function flipUntil(
  seed: string,
  wanted: boolean,
): { state: RunState; result: ReturnType<typeof applyAction> } {
  for (let i = 0; i < 40; i += 1) {
    const state = desperate(`${seed}-${i}`);
    const result = applyAction(state, { type: "hack" });
    const flip = eventsOfType(result.events, "hack")[0];
    if (flip?.success === wanted) return { state, result };
  }
  throw new Error(`no ${wanted ? "winning" : "losing"} flip in forty seeds`);
}

describe("the hack offer", () => {
  test("is absent in an ordinary turn and appears with production's patience nearly gone", () => {
    const calm = inHand("calm");
    expect(hackOffer(calm, gatherEffects(calm))).toBeNull();
    expect(offered(calm)).toBe(false);
    expect(getActionPreview(calm, { type: "hack" }).blocked?.key).toBe("notes.hack_unavailable");

    const state = desperate("patience");
    expect(hackOffer(state, gatherEffects(state))).toBe("patience");
    expect(offered(state)).toBe(true);
    const preview = getActionPreview(state, { type: "hack" });
    expect(preview.successPct).toBe(BALANCE.hack.chancePct);
    expect(preview.consumesTurn).toBe(true);
    expect(preview.notes.map((n) => n.key)).toEqual([
      "notes.hack_win.patience",
      "notes.hack_lose.patience",
    ]);
  });

  test("appears with no energy under a pile of tickets, and with servers saturated and no rung affordable", () => {
    const tired = inHand("tired");
    tired.player.energy = 0;
    const model = Object.values(tired.tickets).find((t) => t.kind === "feature");
    if (model === undefined) throw new Error("expected a feature");
    // Two more features open in hand, on top of the one already there.
    for (let i = 0; i < BALANCE.hack.offerAtWipExtra; i += 1) {
      const id = `t${tired.nextTicketSerial}` as const;
      tired.nextTicketSerial += 1;
      tired.tickets[id] = { ...model, id, status: "open", nodeIds: [] };
    }
    expect(hackOffer(tired, gatherEffects(tired))).toBe("energy");

    const saturated = inHand("saturated");
    saturated.money = 0;
    const shipped = Object.values(saturated.tickets).find((t) => t.kind === "feature");
    if (shipped === undefined) throw new Error("expected a feature");
    shipped.status = "merged";
    shipped.load = capacityOf(gatherEffects(saturated)) * 2;
    expect(hackOffer(saturated, gatherEffects(saturated))).toBe("capacity");
  });

  test("is offered once a sprint, whatever the coin said", () => {
    const state = desperate("once");
    const after = applyAction(state, { type: "hack" }).state;
    if (after.phase.kind === "game_over") return;
    after.quality = state.quality;
    expect(hackOffer(after, gatherEffects(after))).toBeNull();
    expect(offered(after)).toBe(false);
  });

  test("won, it buys back the patience; lost, it ends the run", () => {
    const win = flipUntil("win", true);
    expect(win.result.state.quality).toBe(
      Math.max(0, win.state.quality - BALANCE.hack.patienceRelief),
    );
    expect(win.result.state.phase.kind).toBe("choose_action");
    expect(win.result.state.turn).toBe(win.state.turn + 1);
    const relief = eventsOfType(win.result.events, "quality").find((e) => e.source === "hack");
    expect(relief?.delta).toBe(-BALANCE.hack.patienceRelief);

    const loss = flipUntil("loss", false);
    expect(loss.result.state.phase).toEqual({ kind: "game_over", reason: "caught" });
  });

  test("a run that never hacks replays as before, and the supervisor never takes it", () => {
    const run = play(inHand("no-hack"), { pick: policy("craft"), limit: 80 });
    let replayed = inHand("no-hack");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(hashState(replayed)).toBe(hashState(run.state));

    const state = desperate("supervisor");
    state.upgrades.ai_supervisor = 3;
    const move = chooseSupervisor(toSnapshot(state));
    expect(move?.action.type).not.toBe("hack");
  });
});
