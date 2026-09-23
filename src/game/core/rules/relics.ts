import {
  nextRank,
  RELIC_BOOST_IDS,
  RELIC_KEEP_IDS,
  RELICS,
  type RelicCondition,
  type RelicId,
} from "@/game/content";
import type { Effects } from "@/game/content/effects";
import { BALANCE } from "@/game/core/balance";
import { arriveTicketOfKind } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { repayDebt } from "@/game/core/rules/debt";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { gainEnergy, syncEnergyMax } from "@/game/core/rules/energy";
import { grantSkillPoints } from "@/game/core/rules/grants";
import { adjustShare } from "@/game/core/rules/market";
import { energyMax } from "@/game/core/rules/modifiers";
import { changeMoney } from "@/game/core/rules/money";
import { lowerQuality } from "@/game/core/rules/quality";
import { addDev, maxSeats } from "@/game/core/rules/team";
import { backlogTickets } from "@/game/core/rules/tickets";
import { tierScale } from "@/game/core/rules/tier";
import type { NodeId, RunState } from "@/game/core/types";

/**
 * The sprint bonus. A boost does its thing now and is forgotten; a keep
 * joins `state.relics` and its effects are gathered every turn like a
 * skill's. What is offered depends on the run — a full bar is never
 * offered a refill — and the previous offer is held back, so three
 * sprints in a row do not ask the same question.
 */

function holds(state: RunState, effects: Effects, when: RelicCondition): boolean {
  switch (when) {
    case "energy_missing":
      return state.player.energy < energyMax(state, effects);
    case "debt_present":
      return state.debt >= BALANCE.relics.debtWorthClearing;
    case "quality_present":
      return state.quality >= BALANCE.relics.qualityWorthEasing;
    case "seat_free":
      return state.devs.length < maxSeats(effects);
    case "dev_promotable":
      return state.devs.some((dev) => nextRank(dev.rank) !== dev.rank);
    case "no_discount":
      return state.boosts.shopDiscountPct === 0;
    case "no_free_hire":
      return !state.boosts.freeHire && state.devs.length < maxSeats(effects);
    case "unread_ai":
      return Object.values(state.nodes).some(
        (node) => node.commit.mode === "ai" && !node.commit.reviewed,
      );
    case "backlog_untouched":
      return backlogTickets(state).some((ticket) => ticket.nodeIds.length === 0);
    case "no_revenue_boost":
      return state.boosts.revenueBoostMonths === 0;
  }
}

/** Everything that could be offered right now, keeps first. */
export function eligibleRelics(state: RunState, effects: Effects): RelicId[] {
  const owned = new Set(state.relics);
  const keeps = RELIC_KEEP_IDS.filter((id) => !owned.has(id));
  const boosts = RELIC_BOOST_IDS.filter((id) => {
    const when = RELICS[id].when;
    return when === undefined || holds(state, effects, when);
  });
  return [...keeps, ...boosts];
}

/**
 * Two boosts and a keep while keeps remain, boosts alone after; one more
 * boost when the sprint's objective was met. Last sprint's offer is left
 * out unless there is nothing else.
 */
export function drawRelicOffer(context: RuleContext, count: number): RelicId[] {
  const { state, rng } = context;
  const eligible = eligibleRelics(state, context.effects);
  const last = new Set(state.lastRelicOffer);
  const fresh = (ids: RelicId[]): RelicId[] => {
    const unseen = ids.filter((id) => !last.has(id));
    return unseen.length >= ids.length ? ids : [...unseen, ...ids.filter((id) => last.has(id))];
  };
  const keeps = fresh(eligible.filter((id) => RELICS[id].kind === "keep"));
  const boosts = fresh(eligible.filter((id) => RELICS[id].kind === "boost"));

  // Both shuffles always happen, so the draw count never depends on the
  // sizes of the pools.
  const shuffledKeeps = rng.shuffle(keeps);
  const shuffledBoosts = rng.shuffle(boosts);
  const keepCount = Math.min(BALANCE.relics.keepsPerOffer, shuffledKeeps.length);
  const picked = [
    ...pickFresh(shuffledKeeps, last, keepCount),
    ...pickFresh(shuffledBoosts, last, count - keepCount),
  ];
  const offer = picked.sort();
  state.lastRelicOffer = [...offer];
  for (const id of offer) state.stats.relicsOffered[id] = (state.stats.relicsOffered[id] ?? 0) + 1;
  return offer;
}

/** The first `n` of a shuffled pool, preferring those not in last sprint's offer. */
function pickFresh(shuffled: RelicId[], last: Set<RelicId>, n: number): RelicId[] {
  const unseen = shuffled.filter((id) => !last.has(id));
  const seen = shuffled.filter((id) => last.has(id));
  return [...unseen, ...seen].slice(0, Math.max(0, n));
}

export function chooseRelic(context: RuleContext, relicId: RelicId): void {
  const { state } = context;
  const def = RELICS[relicId];
  state.stats.relicsChosen[relicId] = (state.stats.relicsChosen[relicId] ?? 0) + 1;

  if (def.kind === "keep") {
    if (state.relics.includes(relicId)) return;
    state.relics.push(relicId);
    state.relics.sort();
    context.refresh();
    syncEnergyMax(context);
    emit(context, { type: "relic_chosen", relicId, kind: "keep" });
    return;
  }

  emit(context, { type: "relic_chosen", relicId, kind: "boost" });
  applyBoost(context, relicId);
}

function applyBoost(context: RuleContext, relicId: RelicId): void {
  const { state } = context;
  const boost = RELICS[relicId].boost;
  if (boost === undefined) return;

  if (boost.fullEnergy === true) {
    gainEnergy(context, energyMax(state, context.effects) - state.player.energy, "relic");
  }
  if (boost.debt !== undefined) repayDebt(context, boost.debt === "all" ? state.debt : boost.debt);
  if (boost.quality !== undefined) lowerQuality(context, boost.quality, "event");
  if (boost.dev !== undefined && state.devs.length < maxSeats(context.effects)) {
    addDev(context, boost.dev, { relic: relicId });
  }
  if (boost.promote === true) {
    const dev = [...state.devs].reverse().find((d) => nextRank(d.rank) !== d.rank);
    if (dev !== undefined) {
      dev.rank = nextRank(dev.rank);
      emit(context, { type: "dev_promoted", devId: dev.id, rank: dev.rank });
    }
  }
  if (boost.shopDiscountPct !== undefined) state.boosts.shopDiscountPct = boost.shopDiscountPct;
  if (boost.freeHire === true) state.boosts.freeHire = true;
  if (boost.money !== undefined) {
    changeMoney(
      context,
      boost.money * tierScale(state.tier, BALANCE.economy.tier.mrrGrowth),
      "relic",
    );
  }
  if (boost.skillPoints !== undefined) grantSkillPoints(context, boost.skillPoints);
  if (boost.share !== undefined) {
    adjustShare(context, boost.share, mrrOf(state, context.effects), loadOf(state));
  }
  if (boost.extraTurns !== undefined) state.boosts.extraTurns += boost.extraTurns;
  if (boost.reviewAll === true) {
    const nodeIds: NodeId[] = [];
    for (const node of Object.values(state.nodes)) {
      if (node.commit.mode === "ai" && !node.commit.reviewed) {
        node.commit.reviewed = true;
        nodeIds.push(node.id);
      }
    }
    emit(context, { type: "reviewed", nodeIds, debtDelta: 0, chain: false, free: true });
  }
  if (boost.clearBacklog === true) {
    for (const ticket of backlogTickets(state)) {
      if (ticket.nodeIds.length > 0) continue;
      ticket.status = "cancelled";
      emit(context, {
        type: "ticket_cancelled",
        ticketId: ticket.id,
        ...(ticket.skillId === undefined ? {} : { skillId: ticket.skillId }),
      });
    }
  }
  if (boost.ticket !== undefined) arriveTicketOfKind(context, boost.ticket);
  if (boost.revenueBoostMonths !== undefined) {
    state.boosts.revenueBoostMonths += boost.revenueBoostMonths;
  }
}

/** Turns in the sprint under way: the box, plus what a bonus added. */
export function sprintTurns(state: RunState): number {
  return BALANCE.sprint.turns + state.boosts.extraTurns;
}
