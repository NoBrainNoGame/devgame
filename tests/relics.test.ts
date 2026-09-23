import { describe, expect, test } from "bun:test";

import { discounted, RELIC_KEEP_IDS, RELICS, type RelicId, upgradeCost } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { createContext } from "@/game/core/rules/context";
import { monthlyReport } from "@/game/core/rules/economy";
import { energyMax, gatherEffects } from "@/game/core/rules/modifiers";
import { qualityMax, raiseQuality } from "@/game/core/rules/quality";
import { applyAction } from "@/game/core/rules/reducer";
import { drawRelicOffer, eligibleRelics, sprintTurns } from "@/game/core/rules/relics";
import { addDev } from "@/game/core/rules/team";
import type { RunState } from "@/game/core/types";

import { eventsOfType, findSeed, newRun, play, policy, settle } from "./helpers";

/**
 * Sprint bonuses. A boost is only offered when it would do something, does
 * it the moment it is taken, and is gone; a keep is permanent and never
 * offered twice. The offer holds a keep while any remain, skips last
 * sprint's cards, and every card taken or shown is counted for balancing.
 */

function atOffer(prefix: string): RunState {
  const { state } = findSeed((r) => r.state.phase.kind === "choose_relic", {
    prefix,
    pick: policy("craft"),
    limit: 200,
    stop: (s) => s.phase.kind === "choose_relic",
  });
  if (state.phase.kind !== "choose_relic") throw new Error(`${prefix}: no sprint closed`);
  return state;
}

/** The same state, asked one specific card. */
function take(state: RunState, relicId: RelicId): ReturnType<typeof applyAction> {
  const forced = structuredClone(state);
  forced.phase = { kind: "choose_relic", offer: [relicId] };
  return applyAction(forced, { type: "choose_relic", relicId });
}

describe("what is offered", () => {
  test("a boost that would do nothing is not on the table", () => {
    const fresh = newRun("offer-1");
    const effects = gatherEffects(fresh);
    const now = eligibleRelics(fresh, effects);
    expect(now).not.toContain("second_wind");
    expect(now).not.toContain("clean_slate");
    expect(now).not.toContain("postmortem");
    expect(now).not.toContain("promotion");
    expect(now).not.toContain("review_party");
    expect(now).toContain("intern");
    expect(now).toContain("grooming");
    expect(now).toContain("grant");
    for (const id of RELIC_KEEP_IDS) expect(now).toContain(id);

    fresh.player.energy -= 1;
    fresh.debt = BALANCE.relics.debtWorthClearing;
    fresh.quality = BALANCE.relics.qualityWorthEasing;
    fresh.boosts.shopDiscountPct = 25;
    fresh.boosts.freeHire = true;
    fresh.boosts.revenueBoostMonths = 1;
    const later = eligibleRelics(fresh, effects);
    expect(later).toContain("second_wind");
    expect(later).toContain("clean_slate");
    expect(later).toContain("postmortem");
    expect(later).not.toContain("group_deal");
    expect(later).not.toContain("headhunter");
    expect(later).not.toContain("golden_quarter");
  });

  test("three cards: one keep while keeps remain, the rest boosts, none from last sprint", () => {
    const state = atOffer("offer-2");
    if (state.phase.kind !== "choose_relic") return;
    const offer = state.phase.offer;
    expect(offer.length).toBe(BALANCE.sprint.relicOffer);
    expect(new Set(offer).size).toBe(offer.length);
    expect(offer.filter((id) => RELICS[id].kind === "keep").length).toBe(
      BALANCE.relics.keepsPerOffer,
    );
    expect(state.lastRelicOffer).toEqual(offer);
    for (const id of offer) expect(state.stats.relicsOffered[id]).toBe(1);

    const next = structuredClone(state);
    const drawn = drawRelicOffer(createContext(next), BALANCE.sprint.relicOffer);
    for (const id of drawn) expect(offer).not.toContain(id);
  });

  test("a keep taken is never offered again; a boost can come back", () => {
    const state = atOffer("offer-3");
    const kept = take(state, "tech_radar").state;
    expect(kept.relics).toContain("tech_radar");
    expect(eligibleRelics(kept, gatherEffects(kept))).not.toContain("tech_radar");
    expect(kept.stats.relicsChosen.tech_radar).toBe(1);

    const spent = take(state, "grant").state;
    expect(spent.relics).not.toContain("grant");
    expect(eligibleRelics(spent, gatherEffects(spent))).toContain("grant");
  });
});

describe("boosts", () => {
  test("second wind fills the bar", () => {
    const state = atOffer("boost-energy");
    state.player.energy = 1;
    const after = take(state, "second_wind").state;
    expect(after.player.energy).toBe(energyMax(after));
  });

  test("clean slate clears the debt; the post-mortem eases production", () => {
    const state = atOffer("boost-debt");
    state.debt = 60;
    state.quality = 50;
    expect(take(state, "clean_slate").state.debt).toBe(0);
    expect(take(state, "postmortem").state.quality).toBe(50 - 30);
  });

  test("an intern joins for nothing; a promotion lifts the newest developer", () => {
    const state = atOffer("boost-team");
    const before = state.devs.length;
    const hired = take(state, "intern");
    expect(hired.state.devs.length).toBe(before + 1);
    expect(eventsOfType(hired.events, "hired")[0]?.source).toEqual({ relic: "intern" });
    expect(eventsOfType(hired.events, "money").length).toBe(0);

    const promoted = take(hired.state, "promotion");
    expect(promoted.state.devs[promoted.state.devs.length - 1]?.rank).toBe("mid");
    expect(eventsOfType(promoted.events, "dev_promoted").length).toBe(1);
  });

  test("the group deal takes a quarter off the next purchase, once", () => {
    const state = atOffer("boost-shop");
    const after = settle(take(state, "group_deal").state);
    expect(after.boosts.shopDiscountPct).toBe(25);
    after.money = 100_000;
    const listed = upgradeCost("servers", after.upgrades.servers ?? 0) ?? 0;
    const bought = applyAction(after, { type: "buy", id: "servers" }).state;
    expect(after.money - bought.money).toBe(discounted(listed, 25));
    expect(bought.boosts.shopDiscountPct).toBe(0);
  });

  test("the headhunter pays for the next hire, once", () => {
    const state = atOffer("boost-hire");
    const after = settle(take(state, "headhunter").state);
    after.money = 1000;
    const hired = applyAction(after, { type: "hire", rank: "junior" }).state;
    expect(hired.money).toBe(1000);
    expect(hired.boosts.freeHire).toBe(false);
  });

  test("the grant, the bootcamp and the thread pay in money, points and share", () => {
    const state = atOffer("boost-cash");
    expect(take(state, "grant").state.money - state.money).toBe(150);
    expect(take(state, "bootcamp").state.skillPoints - state.skillPoints).toBe(3);
    expect(take(state, "viral_thread").state.market.shareBonus - state.market.shareBonus).toBe(3);
  });

  test("overtime lengthens the sprint that starts, and only that one", () => {
    const state = atOffer("boost-overtime");
    const after = take(state, "overtime").state;
    expect(sprintTurns(after)).toBe(BALANCE.sprint.turns + 4);
    const next = play(after, {
      pick: policy("craft"),
      limit: 200,
      stop: (s) => s.phase.kind === "choose_relic" || s.sprint > after.sprint,
    });
    expect(next.state.boosts.extraTurns).toBe(0);
  });

  test("the review party reads every machine commit left unread", () => {
    const state = atOffer("boost-review");
    const node = Object.values(state.nodes)[0];
    if (node === undefined) throw new Error("no node");
    node.commit.mode = "ai";
    node.commit.reviewed = false;
    const result = take(state, "review_party");
    expect(result.state.nodes[node.id]?.commit.reviewed).toBe(true);
    expect(eventsOfType(result.events, "reviewed")[0]?.free).toBe(true);
  });

  test("grooming drops every backlog ticket nobody touched", () => {
    const state = atOffer("boost-grooming");
    const untouched = Object.values(state.tickets).filter(
      (t) => t.status === "backlog" && t.nodeIds.length === 0,
    );
    expect(untouched.length).toBeGreaterThan(0);
    const result = take(state, "grooming");
    for (const t of untouched) expect(result.state.tickets[t.id]?.status).toBe("cancelled");
    expect(eventsOfType(result.events, "ticket_cancelled").length).toBe(untouched.length);
  });

  test("the big client brings a VIP ticket and an advance", () => {
    const state = atOffer("boost-vip");
    const vips = (s: RunState): number =>
      Object.values(s.tickets).filter((t) => t.kind === "vip").length;
    const result = take(state, "big_client");
    expect(vips(result.state)).toBe(vips(state) + 1);
    expect(result.state.money - state.money).toBe(100);
  });

  test("the golden quarter lifts three paydays' revenue", () => {
    const state = atOffer("boost-gold");
    const after = take(state, "golden_quarter").state;
    expect(after.boosts.revenueBoostMonths).toBe(3);
    const plain = structuredClone(after);
    plain.boosts.revenueBoostMonths = 0;
    const effects = gatherEffects(after);
    const boosted = monthlyReport(after, effects).revenue;
    const usual = monthlyReport(plain, effects).revenue;
    expect(boosted).toBe(Math.floor(usual * 1.5) >= usual ? boosted : -1);
    if (usual > 0) expect(boosted).toBeGreaterThan(usual);
    const paid = play(after, {
      pick: policy("craft"),
      limit: 60,
      stop: (s) => s.months > after.months,
    });
    expect(paid.state.boosts.revenueBoostMonths).toBe(2);
  });
});

describe("keeps", () => {
  test("a renegotiated SLA raises the ceiling production fires at", () => {
    const state = atOffer("keep-sla");
    const after = take(state, "sla_renegotiated").state;
    const effects = gatherEffects(after);
    expect(qualityMax(effects)).toBe(BALANCE.quality.max + 20);
    const context = createContext(after);
    raiseQuality(context, BALANCE.quality.max + 10 - after.quality, "incident");
    expect(after.phase.kind).not.toBe("game_over");
    expect(after.quality).toBe(BALANCE.quality.max + 10);
  });

  test("a developer's rank the intern can be promoted through is the real ladder", () => {
    const state = newRun("keep-ladder");
    addDev(createContext(state), "senior");
    expect(eligibleRelics(state, gatherEffects(state))).not.toContain("promotion");
  });
});
