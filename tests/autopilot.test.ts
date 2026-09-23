import { describe, expect, test } from "bun:test";

import { chooseAutopilot } from "@/game/bridge/autopilot";
import { IDLE_SPEEDS, idleSpeedAllowed, idleTarget } from "@/game/bridge/idle";
import { toSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor, SUPERVISOR_REASONS } from "@/game/bridge/supervisor";
import { getAvailableActions, isSameAction } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import type { PlayerAction } from "@/game/core/types";

import { findSeed, inHand, isType, makeReady, newRun, play, policy, settle } from "./helpers";

/**
 * The idle clock's move is a legal move in every phase, so a run left alone
 * never stalls on a question — and it is the same move the bar points at.
 */
describe("the idle clock's target", () => {
  const legal = (state: ReturnType<typeof newRun>): void => {
    const target = idleTarget(toSnapshot(state));
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(getAvailableActions(state).some((a) => isSameAction(a, target))).toBe(true);
  };

  test("nothing in hand and no supervisor: it starts a ticket", () => {
    const state = newRun("idle-start");
    expect(idleTarget(toSnapshot(state))?.type).toBe("start");
    legal(state);
  });

  test("a ticket in hand and no supervisor: it rests", () => {
    const state = inHand("idle-rest");
    expect(idleTarget(toSnapshot(state))?.type).toBe("rest");
    legal(state);
  });

  test("an accepted review waits for the merge; a refused one carries on", () => {
    const accepted = applyAction(makeReady(inHand("idle-merge")), { type: "submit" }).state;
    if (accepted.phase.kind === "pr_accepted") {
      expect(idleTarget(toSnapshot(accepted))?.type).toBe("merge");
      legal(accepted);
    }
    const rejected = makeReady(inHand("idle-resume"));
    rejected.debt = 90;
    const refused = applyAction(rejected, { type: "submit" }).state;
    expect(refused.phase.kind).toBe("ticket_rejected");
    expect(idleTarget(toSnapshot(refused))?.type).toBe("resume");
    legal(refused);
  });

  test("a relic offer takes the first relic; a conflict is fixed by hand", () => {
    const { state: relic } = findSeed((r) => r.state.phase.kind === "choose_relic", {
      prefix: "idle-relic",
      pick: policy("craft"),
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic",
    });
    expect(idleTarget(toSnapshot(relic))?.type).toBe("choose_relic");
    legal(relic);

    const { state: conflict } = findSeed((r) => r.state.phase.kind === "resolve_conflict", {
      prefix: "idle-conflict",
      pick: policy("craft"),
      limit: 300,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });
    const move = idleTarget(toSnapshot(conflict));
    expect(move?.type === "resolve_conflict" && move.how).toBe("manual");
    legal(conflict);
  });

  test("a run that is over has no move", () => {
    const state = inHand("idle-over");
    state.phase = { kind: "game_over", reason: "burnout" };
    expect(idleTarget(toSnapshot(state))).toBeUndefined();
    expect(isType("rest")({ type: "rest" })).toBe(true);
  });

  test("the supervisor's first level is the autopilot, and every level plays a legal move", () => {
    for (let level = 1; level <= 3; level += 1) {
      const run = play(inHand(`supervisor-${level}`), { pick: policy("craft"), limit: 30 });
      const state = settle(run.state);
      if (state.phase.kind !== "choose_action") continue;
      state.upgrades.ai_supervisor = level;
      state.money = 5_000;
      const snapshot = toSnapshot(state);
      const move = chooseSupervisor(snapshot);
      expect(move).toBeDefined();
      if (move === undefined) continue;
      expect(getAvailableActions(state).some((a) => isSameAction(a, move.action))).toBe(true);
      expect(SUPERVISOR_REASONS).toContain(move.reason);
      if (level === 1) expect(move.action).toEqual(chooseAutopilot(snapshot) as PlayerAction);
      // The bar and the driver read the same move.
      expect(idleTarget(snapshot)).toEqual(move.action);
    }
  });

  test("the third level buys the advised rung before playing a turn", () => {
    const state = inHand("supervisor-buys");
    state.upgrades.ai_supervisor = 3;
    state.money = 10_000;
    const shipped = Object.values(state.tickets).find((t) => t.kind === "feature");
    if (shipped === undefined) throw new Error("expected a feature");
    shipped.status = "merged";
    shipped.load = 10_000;
    const move = chooseSupervisor(toSnapshot(state));
    expect(move?.reason).toBe("buy");
    expect(move?.action.type).toBe("buy");
  });

  test("a run left to the supervisor at every level never stalls", () => {
    for (let level = 1; level <= 3; level += 1) {
      let state = inHand(`supervisor-run-${level}`);
      state.upgrades.ai_supervisor = level;
      state.money = 2_000;
      let stalls = 0;
      for (let i = 0; i < 300 && state.phase.kind !== "game_over"; i += 1) {
        const target = idleTarget(toSnapshot(state));
        if (target === undefined) {
          stalls += 1;
          break;
        }
        state = applyAction(state, target).state;
      }
      expect(stalls).toBe(0);
    }
  });

  test("speeds unlock one tier at a time", () => {
    expect(IDLE_SPEEDS).toEqual([1, 10, 100]);
    expect(idleSpeedAllowed(0, 1)).toBe(true);
    expect(idleSpeedAllowed(0, 10)).toBe(false);
    expect(idleSpeedAllowed(1, 10)).toBe(true);
    expect(idleSpeedAllowed(1, 100)).toBe(false);
    expect(idleSpeedAllowed(2, 100)).toBe(true);
  });
});
