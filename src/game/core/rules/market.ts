import { COMPETITOR_IDS, COMPETITORS, type CompetitorId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { tierScale } from "@/game/core/rules/tier";
import type { MarketState, RunState } from "@/game/core/types";

/**
 * The market. Nothing here is a number the player sets: the share is
 * derived from what the run has shipped against what the competitors
 * weigh, and it moves by what customers remember — a bug fixed in time, a
 * VIP kept waiting. The competitors drift every month, enter at their
 * tier, and merge when one of them has swallowed most of the rest. That
 * drift is the one thing here that draws, and it draws for every
 * competitor every month, alive or not, so the stream never depends on who
 * happens to be standing.
 */

export function initialMarket(): MarketState {
  const competitors = {} as MarketState["competitors"];
  for (const id of COMPETITOR_IDS) {
    const def = COMPETITORS[id];
    competitors[id] =
      def.entersAtTier <= 0
        ? { strength: def.baseStrength, status: "alive" }
        : { strength: 0, status: "waiting" };
  }
  return { shareBonus: 0, priceWarUntilMonth: null, competitors };
}

/** The run's weight on the market: revenue, and users at ten to the euro. */
export function powerOf(mrr: number, load: number): number {
  return mrr + load / BALANCE.market.usersPerPower;
}

export function competitorsAlive(state: RunState): CompetitorId[] {
  return COMPETITOR_IDS.filter((id) => state.market.competitors[id].status === "alive");
}

/** The run's share of the market, 0 to 1. */
export function shareOf(state: RunState, mrr: number, load: number): number {
  const power = powerOf(mrr, load);
  const rivals = competitorsAlive(state).reduce(
    (sum, id) => sum + state.market.competitors[id].strength,
    0,
  );
  const raw = power + rivals <= 0 ? 0 : power / (power + rivals);
  return Math.min(1, Math.max(0, raw + state.market.shareBonus / 100));
}

/** What the share does to the revenue, the price war included. */
export function revenueMultiplier(state: RunState, share: number): number {
  const { multiplier, priceWar } = BALANCE.market;
  let value = multiplier.min + (multiplier.max - multiplier.min) * share;
  if (state.market.priceWarUntilMonth !== null && state.months < state.market.priceWarUntilMonth) {
    value -= priceWar.penalty;
  }
  return Math.max(0, value);
}

export function adjustShare(context: RuleContext, delta: number, mrr: number, load: number): void {
  if (delta === 0) return;
  const { state } = context;
  state.market.shareBonus += delta;
  emit(context, { type: "share_changed", delta, share: shareOf(state, mrr, load) });
}

export function bumpCompetitor(context: RuleContext, id: CompetitorId, pct: number): void {
  const competitor = context.state.market.competitors[id];
  if (competitor.status !== "alive") return;
  competitor.strength = Math.max(1, Math.round(competitor.strength * (1 + pct / 100)));
}

export function startPriceWar(context: RuleContext): void {
  const { state } = context;
  const untilMonth = state.months + BALANCE.market.priceWar.months;
  state.market.priceWarUntilMonth = untilMonth;
  emit(context, { type: "price_war", untilMonth });
}

/** The strongest competitor standing joins the run: bought with a company. */
export function buyStrongestCompetitor(context: RuleContext): CompetitorId | undefined {
  const { state } = context;
  const alive = competitorsAlive(state);
  const strongest = alive.sort(
    (a, b) => state.market.competitors[b].strength - state.market.competitors[a].strength,
  )[0];
  if (strongest === undefined) return undefined;
  state.market.competitors[strongest].status = "bought";
  emit(context, { type: "competitor_bought", id: strongest });
  return strongest;
}

/**
 * A month on the market: newcomers at their tier, growth by aggression and
 * a jitter drawn for everyone, and a merger rolled once a competitor holds
 * most of their combined weight.
 */
export function driftMarket(context: RuleContext): void {
  const { state, rng } = context;
  const { jitterPct, merge } = BALANCE.market;

  for (const id of COMPETITOR_IDS) {
    const def = COMPETITORS[id];
    const competitor = state.market.competitors[id];
    // Drawn for every competitor, standing or not: a fixed number of draws
    // a month, whoever is alive.
    const jitter = rng.int(-jitterPct, jitterPct);
    if (competitor.status === "waiting" && state.tier >= def.entersAtTier) {
      competitor.status = "alive";
      competitor.strength = Math.round(
        def.baseStrength * tierScale(def.entersAtTier, BALANCE.economy.tier.mrrGrowth),
      );
      emit(context, { type: "competitor_entered", id });
      continue;
    }
    if (competitor.status !== "alive") continue;
    competitor.strength = Math.max(
      1,
      Math.round(competitor.strength * (1 + (def.aggression + jitter) / 100)),
    );
  }

  // One roll a month, whether or not anyone dominates: the stream stays put.
  const rolled = rng.chance(merge.chancePct);
  const alive = competitorsAlive(state);
  if (alive.length < 2) return;
  const total = alive.reduce((sum, id) => sum + state.market.competitors[id].strength, 0);
  const sorted = [...alive].sort(
    (a, b) => state.market.competitors[b].strength - state.market.competitors[a].strength,
  );
  const biggest = sorted[0];
  const smallest = sorted[sorted.length - 1];
  if (biggest === undefined || smallest === undefined || biggest === smallest) return;
  const dominant = state.market.competitors[biggest].strength * 100 >= total * merge.dominancePct;
  if (!rolled || !dominant) return;

  state.market.competitors[biggest].strength += state.market.competitors[smallest].strength;
  state.market.competitors[smallest].status = "merged";
  state.market.competitors[smallest].mergedInto = biggest;
  emit(context, { type: "competitor_merged", id: smallest, into: biggest });
}

export function priceWarMonthsLeft(state: RunState): number {
  if (state.market.priceWarUntilMonth === null) return 0;
  return Math.max(0, state.market.priceWarUntilMonth - state.months);
}
