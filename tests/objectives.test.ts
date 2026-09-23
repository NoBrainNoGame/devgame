import { describe, expect, test } from "bun:test";

import { OBJECTIVE_IDS, OBJECTIVES } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { createContext } from "@/game/core/rules/context";
import { objectiveMet, objectiveProgress, settleObjective } from "@/game/core/rules/objectives";
import { applyAction } from "@/game/core/rules/reducer";
import { endSprint } from "@/game/core/rules/sprint";
import { hashState } from "@/game/core/run";
import type { RunState } from "@/game/core/types";

import { eventsOfType, inHand, newRun, play, policy, settle } from "./helpers";

/**
 * What a sprint asks: drawn at every start, settled at every release, with
 * a reward for making it and, for one of them, a cost for not.
 */

function withObjective(seed: string, id: (typeof OBJECTIVE_IDS)[number], target = 0): RunState {
  const state = inHand(seed);
  state.objective = { id, target };
  state.narrative.lastTurn = state.turn + 1000;
  return state;
}

function release(state: RunState): ReturnType<typeof applyAction> {
  state.sprintTurn = BALANCE.sprint.turns - 1;
  return applyAction(state, { type: "rest" });
}

describe("sprint objectives", () => {
  test("every run starts with one, every sprint draws one, and each kind is drawn somewhere", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const state = newRun(`objective-${i}`);
      expect(state.objective).not.toBeNull();
      if (state.objective !== null) seen.add(state.objective.id);
      state.tier = 1;
      const run = play(state, {
        pick: (_, actions) => actions.find((a) => a.type === "rest"),
        limit: 40,
        stop: (s) => s.sprint >= 3,
      });
      if (run.state.objective !== null) seen.add(run.state.objective.id);
    }
    for (const id of OBJECTIVE_IDS) {
      if (OBJECTIVES[id].requires !== undefined) continue;
      expect(seen.has(id)).toBe(true);
    }
  });

  test("the plainest objective counts what you land; the release pays it", () => {
    const state = withObjective("deliver", "deliver_n", 1);
    expect(objectiveProgress(state)).toBe(0);
    expect(objectiveMet(state)).toBe(false);
    state.sprintPlayerDelivered = 1;
    expect(objectiveMet(state)).toBe(true);
    const money = state.money;
    const { state: after, events } = release(state);
    expect(eventsOfType(events, "objective_done")[0]?.reward).toBe("money");
    expect(after.money).toBeGreaterThan(money);
    expect(after.stats.qualityBySource.objective).toBe(0);
  });

  test("not resting is the one that costs when missed; a relic reward widens the offer", () => {
    const rested = withObjective("no-rest", "no_rest");
    rested.sprintCounters.rests = 1;
    // Something landed this sprint, so the idle-sprint rule stays out of the count.
    rested.sprintPlayerDelivered = 1;
    const { events } = release(rested);
    expect(eventsOfType(events, "objective_failed").length).toBe(1);
    // The clean sprint that follows takes patience back; the cost is read on its own line.
    const cost = eventsOfType(events, "quality").find((e) => e.source === "objective");
    expect(cost?.delta).toBe(OBJECTIVES.no_rest.failPatience ?? 0);

    // Closing the sprint by resting would be a rest: the release is called directly.
    const kept = withObjective("no-rest-kept", "no_rest");
    kept.sprintPlayerDelivered = 1;
    const context = createContext(kept);
    endSprint(context);
    expect(eventsOfType(context.events, "objective_done")[0]?.reward).toBe("relics");
    if (kept.phase.kind === "choose_relic") {
      expect(kept.phase.offer.length).toBe(BALANCE.sprint.relicOffer + 1);
    }
  });

  test("the counters read what the sprint did: rests, machine commits, bugs and VIPs landed", () => {
    const state = withObjective("counters", "by_hand");
    const rested = applyAction(state, { type: "rest" }).state;
    expect(rested.sprintCounters.rests).toBe(1);
    expect(objectiveMet(rested)).toBe(true);
    const machine = applyAction(rested, { type: "commit", mode: "ai" }).state;
    expect(machine.sprintCounters.aiCommits).toBe(1);
    expect(objectiveMet(machine)).toBe(false);
    // Nothing carries over: the next sprint starts clean, with a new objective.
    const next = settle(release(machine).state);
    if (next.phase.kind === "choose_action") {
      expect(next.sprintCounters).toEqual({
        rests: 0,
        aiCommits: 0,
        vipDelivered: 0,
        bugsDelivered: 0,
      });
      expect(next.objective?.outcome).toBeUndefined();
    }
  });

  test("an objective that needs a ticket the board lacks falls back to the plainest", () => {
    for (let i = 0; i < 40; i += 1) {
      const state = newRun(`fallback-${i}`);
      if (state.objective === null) throw new Error("expected an objective");
      const def = OBJECTIVES[state.objective.id];
      if (def.requires === undefined) continue;
      expect(
        Object.values(state.tickets).some((t) => t.kind === def.requires && t.status === "backlog"),
      ).toBe(true);
    }
  });

  test("settling twice does nothing, and a run replays", () => {
    const state = withObjective("twice", "zero_incident");
    const context = createContext(state);
    expect(settleObjective(context)).toBe(false);
    expect(settleObjective(context)).toBe(false);
    expect(eventsOfType(context.events, "objective_done").length).toBe(1);

    const run = play(newRun("objective-replay"), { pick: policy("craft"), limit: 150 });
    let replayed = newRun("objective-replay");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(hashState(replayed)).toBe(hashState(run.state));
  });
});
