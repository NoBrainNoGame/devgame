import { describe, expect, test } from "bun:test";

import { idleTarget } from "@/game/bridge/idle";
import { toSnapshot } from "@/game/bridge/snapshot";
import { NARRATIVE_EVENT_IDS, NARRATIVE_EVENTS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions, isSameAction } from "@/game/core/rules/actions";
import { createContext } from "@/game/core/rules/context";
import { answerEvent, maybeNarrative } from "@/game/core/rules/narrative";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { hashState } from "@/game/core/run";
import type { RunState } from "@/game/core/types";
import { PlayerActionSchema } from "@/game/dto/run";

import { eventsOfType, inHand, newRun, play, policy } from "./helpers";

/**
 * The questions: rare, never before sprint two, drawn the same whether or
 * not they may open, answered for free through the channels the rules
 * already have.
 */

/** A run ready for any event: the tier, the sprint, a developer, a rival. */
function ready(seed: string, tier: number): RunState {
  const state = inHand(seed);
  state.tier = tier;
  state.sprint = 5;
  state.money = 1e6;
  state.narrative.lastTurn = -1000;
  return state;
}

/** Tries seeds until the trigger opens the wanted event, or gives up. */
function open(
  trigger: "sprint_start" | "payday" | "incident" | "tier_up",
  wanted: string,
  tier: number,
): RunState {
  const def = NARRATIVE_EVENTS[wanted as (typeof NARRATIVE_EVENT_IDS)[number]];
  for (let i = 0; i < 400; i += 1) {
    const state = ready(`${wanted}-${i}`, tier);
    // A personal question: the starter it is asked of, and its company on the market.
    if (def.profile !== undefined) state.profileId = def.profile;
    if (def.competitor !== undefined) state.market.competitors[def.competitor].status = "alive";
    if (def.needsDev === true) {
      state.devs.push({
        id: "d1",
        name: "Test",
        rank: "junior",
        hiredRank: "junior",
        delivered: 0,
        hiredSprint: 1,
      });
      state.nextDevSerial = 2;
    }
    maybeNarrative(createContext(state), trigger);
    if (state.phase.kind === "event" && state.phase.eventId === wanted) return state;
  }
  throw new Error(`${wanted} never opened in four hundred seeds`);
}

describe("when a question opens", () => {
  test("never before sprint two, never twice within the cooldown, and never outside an ordinary turn", () => {
    const early = inHand("early");
    early.sprint = 1;
    for (let i = 0; i < 50; i += 1) maybeNarrative(createContext(early), "sprint_start");
    expect(early.phase.kind).toBe("choose_action");

    const state = open("sprint_start", "client_export", 0);
    const context = createContext(state);
    answerEvent(context, "client_export", "decline");
    expect(state.phase.kind).toBe("choose_action");
    expect(state.narrative.lastTurn).toBe(state.turn);
    for (let i = 0; i < 50; i += 1) maybeNarrative(context, "sprint_start");
    expect(state.phase.kind).toBe("choose_action");
    state.turn += BALANCE.narrative.cooldownTurns;
    state.phase = { kind: "pr_accepted", ticketId: "t1" };
    for (let i = 0; i < 50; i += 1) maybeNarrative(context, "sprint_start");
    expect(state.phase.kind).toBe("pr_accepted");
  });

  test("every event opens somewhere, at its tier, with what it needs", () => {
    for (const id of NARRATIVE_EVENT_IDS) {
      const def = NARRATIVE_EVENTS[id];
      const state = open(def.trigger, id, def.minTier);
      if (state.phase.kind !== "event") throw new Error("expected an event");
      if (def.needsCompetitor === true) expect(state.phase.competitorId).toBeDefined();
      if (def.competitor !== undefined) expect(state.phase.competitorId).toBe(def.competitor);
      if (def.needsDev === true) expect(state.phase.devId).toBe("d1");
      const offered = getAvailableActions(state);
      expect(offered.length).toBeGreaterThan(0);
      expect(offered.every((a) => a.type === "answer" && a.eventId === id)).toBe(true);
      for (const action of offered) expect(PlayerActionSchema.safeParse(action).success).toBe(true);
      const target = idleTarget(toSnapshot(state));
      expect(target).toBeDefined();
      if (target !== undefined) expect(offered.some((a) => isSameAction(a, target))).toBe(true);
    }
  });

  test("a personal question is asked of its starter only, and waits for its company", () => {
    const personal = NARRATIVE_EVENT_IDS.filter((id) => NARRATIVE_EVENTS[id].profile !== undefined);
    expect(personal.length).toBeGreaterThan(0);
    for (const id of personal) {
      const def = NARRATIVE_EVENTS[id];
      for (let i = 0; i < 200; i += 1) {
        // Any other starter, with the company on the market: never.
        const other = ready(`${id}-other-${i}`, def.minTier);
        other.profileId = def.profile === "junior" ? "senior" : "junior";
        if (def.competitor !== undefined) other.market.competitors[def.competitor].status = "alive";
        maybeNarrative(createContext(other), def.trigger);
        if (other.phase.kind === "event") expect(other.phase.eventId).not.toBe(id);

        // The right starter, with the company not on the market yet: never either.
        if (def.competitor === undefined) continue;
        const early = ready(`${id}-early-${i}`, def.minTier);
        if (def.profile !== undefined) early.profileId = def.profile;
        early.market.competitors[def.competitor].status = "waiting";
        maybeNarrative(createContext(early), def.trigger);
        if (early.phase.kind === "event") expect(early.phase.eventId).not.toBe(id);
      }
    }
  });

  test("a once-only event fires once; below its tier it never does", () => {
    const state = open("sprint_start", "system_review_policy", 4);
    expect(state.narrative.fired).toContain("system_review_policy");
    answerEvent(createContext(state), "system_review_policy", "acknowledge");
    expect(state.flags.humanReviewOptional).toBe(true);
    state.turn += 100;
    for (let i = 0; i < 200; i += 1) {
      maybeNarrative(createContext(state), "sprint_start");
      if (state.phase.kind === "event") {
        expect(state.phase.eventId).not.toBe("system_review_policy");
        state.phase = { kind: "choose_action" };
        state.turn += BALANCE.narrative.cooldownTurns;
      }
    }
    for (let i = 0; i < 200; i += 1) {
      const low = ready(`low-${i}`, 3);
      maybeNarrative(createContext(low), "sprint_start");
      if (low.phase.kind === "event") expect(low.phase.eventId).not.toBe("system_review_policy");
    }
  });
});

describe("answering", () => {
  test("applies the effects through the usual channels, and costs no turn", () => {
    const state = open("sprint_start", "client_export", 0);
    const energy = state.player.energy;
    const turn = state.turn;
    const { state: after, events } = applyAction(state, {
      type: "answer",
      eventId: "client_export",
      choice: "deliver",
    });
    expect(after.turn).toBe(turn);
    expect(after.phase.kind).toBe("choose_action");
    expect(after.player.energy).toBe(energy - 4);
    expect(after.market.shareBonus).toBe(2);
    expect(eventsOfType(events, "narrative_answered")[0]?.choice).toBe("deliver");
    expect(eventsOfType(events, "share_changed").length).toBe(1);
  });

  test("a ticket, a departure, a price war and a payment each land where they should", () => {
    const vip = open("sprint_start", "vip_deadline", 0);
    const withTicket = applyAction(vip, {
      type: "answer",
      eventId: "vip_deadline",
      choice: "accept",
    }).state;
    expect(
      Object.values(withTicket.tickets).some((t) => t.kind === "vip" && t.status === "backlog"),
    ).toBe(true);

    const poached = open("payday", "poaching", 1);
    const gone = applyAction(poached, {
      type: "answer",
      eventId: "poaching",
      choice: "let_go",
    }).state;
    expect(gone.devs.length).toBe(0);
    const kept = open("payday", "poaching", 1);
    const before = kept.money;
    const raised = applyAction(kept, {
      type: "answer",
      eventId: "poaching",
      choice: "raise",
    }).state;
    expect(raised.devs.length).toBe(1);
    expect(before - raised.money).toBe(200 * 5);

    const war = open("payday", "price_war", 1);
    const fought = applyAction(war, {
      type: "answer",
      eventId: "price_war",
      choice: "fight",
    }).state;
    expect(fought.market.priceWarUntilMonth).not.toBeNull();

    const preview = getActionPreview(kept, {
      type: "answer",
      eventId: "poaching",
      choice: "raise",
    });
    expect(preview.consumesTurn).toBe(false);
    expect(preview.notes.some((n) => n.key === "notes.price")).toBe(true);
  });

  test("an answer nobody can afford is not offered", () => {
    const poached = open("payday", "poaching", 1);
    poached.money = 0;
    const offered = getAvailableActions(poached);
    expect(offered.some((a) => a.type === "answer" && a.choice === "raise")).toBe(false);
    expect(offered.some((a) => a.type === "answer" && a.choice === "let_go")).toBe(true);
    expect(() =>
      applyAction(poached, { type: "answer", eventId: "poaching", choice: "raise" }),
    ).toThrow();
  });

  test("a run replays the same, questions answered or not", () => {
    const run = play(newRun("narrative-replay"), { pick: policy("craft"), limit: 200 });
    let replayed = newRun("narrative-replay");
    for (const action of run.actions) replayed = applyAction(replayed, action).state;
    expect(hashState(replayed)).toBe(hashState(run.state));
  });
});
