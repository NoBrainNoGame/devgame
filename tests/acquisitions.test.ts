import { describe, expect, test } from "bun:test";

import { ACQUISITION_IDS, ACQUISITIONS } from "@/game/content";
import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { capacityStatus, reportCapacity } from "@/game/core/rules/capacity";
import { createContext } from "@/game/core/rules/context";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { hashState } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { RunState } from "@/game/core/types";

import { eventsOfType, inHand, play, policy } from "./helpers";

/**
 * Buying a company: what it brings, what it costs, and what it never does —
 * count towards the score.
 */

function ready(seed: string, tier: number, money: number): RunState {
  const state = inHand(seed);
  state.tier = tier;
  state.money = money;
  return state;
}

function acquires(state: RunState): string[] {
  return getAvailableActions(state).flatMap((a) => (a.type === "acquire" ? [a.id] : []));
}

describe("acquisitions", () => {
  test("each company is for sale from its tier, once, when the money is there", () => {
    expect(acquires(ready("locked", 1, 1e9))).toEqual([]);
    const state = ready("open", 2, 1e9);
    expect(acquires(state)).toEqual(["startup"]);
    expect(getActionPreview(state, { type: "acquire", id: "scaleup" }).blocked?.key).toBe(
      "notes.tier_locked",
    );
    const poor = ready("poor", 2, 10);
    expect(acquires(poor)).toEqual([]);
    expect(getActionPreview(poor, { type: "acquire", id: "startup" }).blocked?.key).toBe(
      "notes.too_expensive",
    );

    const after = applyAction(state, { type: "acquire", id: "startup" }).state;
    expect(acquires(after)).toEqual([]);
    expect(getActionPreview(after, { type: "acquire", id: "startup" }).blocked?.key).toBe(
      "notes.already_acquired",
    );
    expect(() => applyAction(after, { type: "acquire", id: "startup" })).toThrow();
  });

  test("the team walks in, the features earn and weigh, the debt comes along", () => {
    const state = ready("bring", 2, 1e9);
    const def = ACQUISITIONS.startup;
    const before = {
      mrr: mrrOf(state, gatherEffects(state)),
      load: loadOf(state),
      devs: state.devs.length,
      debt: state.debt,
      delivered: state.ticketsDelivered,
      points: state.pointsDelivered,
      xp: state.xpEarned,
      score: computeScore(state),
    };
    const { state: after, events } = applyAction(state, { type: "acquire", id: "startup" });

    expect(state.money - after.money).toBe(def.cost);
    expect(after.devs.length).toBe(before.devs + def.devs.count);
    expect(after.devs.slice(-def.devs.count).every((dev) => dev.rank === def.devs.rank)).toBe(true);
    const hired = eventsOfType(events, "hired");
    expect(hired.length).toBe(def.devs.count);
    expect(hired.every((e) => e.source !== undefined && "acquisition" in e.source)).toBe(true);

    const bought = Object.values(after.tickets).filter((t) => t.origin === "acquired");
    expect(bought.length).toBe(def.features.count);
    expect(bought.every((t) => t.status === "merged" && t.nodeIds.length === 0)).toBe(true);
    expect(mrrOf(after, gatherEffects(after))).toBeGreaterThan(before.mrr);
    expect(loadOf(after)).toBeGreaterThan(before.load);
    expect(after.debt).toBe(before.debt + def.debt);

    const acquired = eventsOfType(events, "acquired")[0];
    expect(acquired?.devIds.length).toBe(def.devs.count);
    expect(acquired?.ticketIds.length).toBe(def.features.count);

    // Bought is not delivered: nothing towards the score or the experience.
    expect(after.ticketsDelivered).toBe(before.delivered);
    expect(after.pointsDelivered).toBe(before.points);
    expect(after.xpEarned).toBe(before.xp);
    expect(computeScore(after)).toBe(before.score);
    expect(checkInvariants(after)).toEqual([]);
  });

  test("the big ones break production on arrival, the small ones do not", () => {
    const small = applyAction(ready("small", 2, 1e9), { type: "acquire", id: "startup" });
    expect(eventsOfType(small.events, "incident")).toEqual([]);
    const big = applyAction(ready("big", 4, 1e9), { type: "acquire", id: "competitor" });
    const incidents = eventsOfType(big.events, "incident");
    expect(incidents.length).toBe(1);
    expect(incidents[0]?.source).toBe("acquisition");
    expect(big.state.stats.incidents).toBe(1);
  });

  test("a run without acquisitions replays exactly as before they existed", () => {
    // The purchase is an action: a log that never takes it reaches the same
    // state whether or not the shop had companies in it.
    const run = play(inHand("replay"), { pick: policy("craft"), limit: 60 });
    expect(run.actions.every((a) => a.type !== "acquire")).toBe(true);
    let replayed = inHand("replay");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(hashState(replayed)).toBe(hashState(run.state));
  });

  test("every company is named for the fingerprint", () => {
    for (const id of ACQUISITION_IDS) expect(ACQUISITIONS[id].id).toBe(id);
  });
});

describe("capacity alerts", () => {
  test("the warning line is crossed before the servers are, and said once per rise", () => {
    const state = inHand("alert");
    const effects = gatherEffects(state);
    expect(capacityStatus(state, effects)).toBe("ok");

    // A feature about to land, heavy enough to cross the warning line.
    const open = Object.values(state.tickets).find((t) => t.kind === "feature");
    if (open === undefined) throw new Error("expected a feature ticket");
    open.status = "open";
    open.points = 10;
    open.filled = 9;
    open.load = 280;
    expect(capacityStatus(state, effects)).toBe("warning");

    const context = createContext(state);
    reportCapacity(context);
    reportCapacity(context);
    const warnings = eventsOfType(context.events, "capacity_warning");
    expect(warnings.length).toBe(1);
    expect(warnings[0]?.level).toBe("warning");
    expect(warnings[0]?.advice?.id).toBe("servers");
    expect(state.capacityAlert).toBe("warning");

    // Landed and over: the level rises once more, then stays quiet.
    open.status = "merged";
    open.load = 400;
    reportCapacity(context);
    reportCapacity(context);
    const all = eventsOfType(context.events, "capacity_warning");
    expect(all.length).toBe(2);
    expect(all[1]?.level).toBe("saturated");
  });
});
