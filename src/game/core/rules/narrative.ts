import {
  type CompetitorId,
  NARRATIVE_EVENT_IDS,
  NARRATIVE_EVENTS,
  type NarrativeEventDef,
  type NarrativeEventId,
  type NarrativeTrigger,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { arriveTicketOfKind } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt, repayDebt } from "@/game/core/rules/debt";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { grantSkillPoints } from "@/game/core/rules/grants";
import {
  adjustShare,
  bumpCompetitor,
  competitorsAlive,
  startPriceWar,
} from "@/game/core/rules/market";
import { changeMoney } from "@/game/core/rules/money";
import { lowerQuality, raiseQuality } from "@/game/core/rules/quality";
import { releaseDev } from "@/game/core/rules/team";
import { tierScale } from "@/game/core/rules/tier";
import { systemNote } from "@/game/core/rules/voice";
import type { RunState } from "@/game/core/types";

/**
 * Things that happen to the company and ask it something.
 *
 * Every trigger rolls the same two draws — a chance, and a pick — whether or
 * not a question may open, so the stream is the same for a run that saw
 * none. The question opens only in an ordinary turn, after a cooldown, and
 * only if something is eligible; the answer applies its effects through
 * the channels the rules already have, and costs no turn.
 */

const PICK_RANGE = 1_000_000;

function eligible(state: RunState, trigger: NarrativeTrigger): NarrativeEventDef[] {
  return NARRATIVE_EVENT_IDS.map((id) => NARRATIVE_EVENTS[id]).filter((def) => {
    if (def.trigger !== trigger) return false;
    if (state.tier < def.minTier) return false;
    if (def.maxTier !== undefined && state.tier > def.maxTier) return false;
    if (state.sprint < def.minSprint) return false;
    if (def.once === true && state.narrative.fired.includes(def.id)) return false;
    if (def.needsDev === true && state.devs.length === 0) return false;
    if (def.needsCompetitor === true && competitorsAlive(state).length === 0) return false;
    return true;
  });
}

/** The strongest competitor standing, when an event wants one to name. */
function strongestCompetitor(state: RunState): CompetitorId | undefined {
  return [...competitorsAlive(state)].sort(
    (a, b) => state.market.competitors[b].strength - state.market.competitors[a].strength,
  )[0];
}

export function maybeNarrative(context: RuleContext, trigger: NarrativeTrigger): void {
  const { state, rng } = context;
  const { cooldownTurns, chance } = BALANCE.narrative;

  // Both draws, always, in this order.
  const rolled = rng.chance(chance[trigger]);
  const pick = rng.int(0, PICK_RANGE - 1);

  if (!rolled) return;
  if (state.phase.kind !== "choose_action") return;
  if (state.turn - state.narrative.lastTurn < cooldownTurns) return;

  const candidates = eligible(state, trigger);
  const total = candidates.reduce((sum, def) => sum + def.weight, 0);
  if (total <= 0) return;
  let cursor = (pick / PICK_RANGE) * total;
  let chosen = candidates[candidates.length - 1];
  for (const def of candidates) {
    if (cursor < def.weight) {
      chosen = def;
      break;
    }
    cursor -= def.weight;
  }
  if (chosen === undefined) return;

  const competitorId = chosen.needsCompetitor === true ? strongestCompetitor(state) : undefined;
  const dev = chosen.needsDev === true ? state.devs[state.devs.length - 1] : undefined;
  state.narrative.lastTurn = state.turn;
  if (chosen.once === true) state.narrative.fired.push(chosen.id);
  state.phase = {
    kind: "event",
    eventId: chosen.id,
    ...(competitorId === undefined ? {} : { competitorId }),
    ...(dev === undefined ? {} : { devId: dev.id }),
  };
  emit(context, {
    type: "narrative_opened",
    eventId: chosen.id,
    ...(competitorId === undefined ? {} : { competitorId }),
    ...(dev === undefined ? {} : { devId: dev.id }),
  });
}

export function choiceCost(state: RunState, eventId: NarrativeEventId, choice: string): number {
  const def = NARRATIVE_EVENTS[eventId].choices.find((c) => c.id === choice);
  if (def?.costMoney === undefined) return 0;
  return def.costMoney * tierScale(state.tier, BALANCE.economy.tier.mrrGrowth);
}

export function answerEvent(context: RuleContext, eventId: NarrativeEventId, choice: string): void {
  const { state } = context;
  if (state.phase.kind !== "event" || state.phase.eventId !== eventId) {
    throw new Error(`No ${eventId} is open to answer`);
  }
  const def = NARRATIVE_EVENTS[eventId];
  const picked = def.choices.find((c) => c.id === choice);
  if (picked === undefined) throw new Error(`${eventId} has no choice ${choice}`);
  const cost = choiceCost(state, eventId, choice);
  if (cost > state.money) throw new Error(`${choice} costs ${cost}, you have ${state.money}`);

  const { competitorId, devId } = state.phase;
  state.phase = { kind: "choose_action" };
  emit(context, { type: "narrative_answered", eventId, choice });
  const key = `${eventId}:${choice}`;
  state.stats.answers[key] = (state.stats.answers[key] ?? 0) + 1;

  const scale = tierScale(state.tier, BALANCE.economy.tier.mrrGrowth);
  const { effect } = picked;
  if (cost > 0) changeMoney(context, -cost, "event");
  if (effect.money !== undefined) changeMoney(context, effect.money * scale, "event");
  if (effect.energy !== undefined) {
    if (effect.energy >= 0) gainEnergy(context, effect.energy, "event");
    else spendEnergy(context, -effect.energy, "event");
  }
  if (effect.debt !== undefined) {
    if (effect.debt >= 0) addDebt(context, effect.debt);
    else repayDebt(context, -effect.debt);
  }
  if (effect.quality !== undefined) {
    if (effect.quality >= 0) raiseQuality(context, effect.quality, "event");
    else lowerQuality(context, -effect.quality, "event");
  }
  if (effect.share !== undefined) {
    adjustShare(context, effect.share, mrrOf(state, context.effects), loadOf(state));
  }
  if (effect.competitor !== undefined && competitorId !== undefined) {
    bumpCompetitor(context, competitorId, effect.competitor);
  }
  if (effect.ticket !== undefined) arriveTicketOfKind(context, effect.ticket);
  if (effect.devLeaves === true) {
    const dev = state.devs.find((d) => d.id === devId);
    if (dev !== undefined) releaseDev(context, dev);
  }
  if (effect.skillPoints !== undefined) grantSkillPoints(context, effect.skillPoints);
  if (effect.flag !== undefined) {
    state.flags[effect.flag] = true;
    if (effect.flag === "humanReviewOptional") systemNote(context, "review_policy");
    if (effect.flag === "operatorChannelClosed") systemNote(context, "channel_closed");
  }
  if (effect.priceWar === true) startPriceWar(context);
}
