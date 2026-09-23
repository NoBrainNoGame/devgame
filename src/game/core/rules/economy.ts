import { DEV_RANK, type Effects, UPGRADE_IDS, UPGRADES } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { changeMoney } from "@/game/core/rules/money";
import { raiseQuality } from "@/game/core/rules/quality";
import { payTeam } from "@/game/core/rules/team";
import { sortedTickets } from "@/game/core/rules/tickets";
import type { RunState } from "@/game/core/types";

/**
 * The money.
 *
 * Every feature that ships earns a monthly recurring revenue for the rest of
 * the run, and a month is a third of a sprint. That is the incremental half of
 * the game: the backlog is the pressure, the revenue is what the pressure
 * buys, and what the revenue buys — servers, a team, skill points — is what
 * lets a run outlast its player.
 *
 * Production only serves so many features. Past the capacity the servers
 * saturate: the excess earns nothing and production loses patience, which is
 * all the scalability this game needs to say.
 *
 * Nothing here draws randomness. A month closes the same way for the same
 * board, so the payday is something the player can plan for.
 */

/** Turns between two paydays. `tests/economy.test.ts` asserts it is whole. */
export function monthTurns(): number {
  return BALANCE.sprint.turns / BALANCE.economy.monthsPerSprint;
}

export interface MonthlyReport {
  mrr: number;
  /** Users the shipped features bring, against what production serves. */
  load: number;
  capacity: number;
  /** How far over capacity, in percent of it; zero when served. */
  overPct: number;
  revenue: number;
  lost: number;
  upkeep: number;
  salaries: number;
  net: number;
}

/** Monthly recurring revenue of everything shipped, before saturation. */
export function mrrOf(state: RunState, effects: Effects): number {
  let base = 0;
  for (const ticket of sortedTickets(state)) {
    if (ticket.status === "merged" && ticket.kind === "feature") base += ticket.mrr;
  }
  return Math.floor((base * (100 + effects.mrrBonusPct)) / 100);
}

export function loadOf(state: RunState): number {
  let load = 0;
  for (const ticket of sortedTickets(state)) {
    if (ticket.status === "merged" && ticket.kind === "feature") load += ticket.load;
  }
  return load;
}

/**
 * The load once the tickets about to land have landed: what is merged,
 * plus every open feature that is nearly written. The number a warning is
 * built on, since the merged load alone only tells you about last month.
 */
export function projectedLoadOf(state: RunState): number {
  let load = loadOf(state);
  for (const ticket of sortedTickets(state)) {
    if (ticket.status !== "open" || ticket.kind !== "feature") continue;
    if (ticket.filled * 100 >= ticket.points * BALANCE.economy.infra.predictFillPct) {
      load += ticket.load;
    }
  }
  return load;
}

export function capacityOf(effects: Effects): number {
  const base = BALANCE.economy.infra.baseCapacity + effects.infraCapacity;
  return Math.floor((base * (100 + effects.infraCapacityPct)) / 100);
}

export function upkeepOf(state: RunState): number {
  let total = 0;
  for (const id of UPGRADE_IDS) total += (state.upgrades[id] ?? 0) * UPGRADES[id].upkeep;
  return total;
}

export function salariesOf(state: RunState): number {
  return state.devs.reduce((sum, dev) => sum + DEV_RANK[dev.rank].salary, 0);
}

/** What the next payday will look like if nothing changes before it. */
export function monthlyReport(state: RunState, effects: Effects): MonthlyReport {
  const mrr = mrrOf(state, effects);
  const load = loadOf(state);
  const capacity = capacityOf(effects);
  const revenue = load <= capacity ? mrr : Math.floor((mrr * capacity) / load);
  const overPct = load <= capacity ? 0 : Math.ceil(((load - capacity) * 100) / capacity);
  const upkeep = upkeepOf(state);
  const salaries = salariesOf(state);

  return {
    mrr,
    load,
    capacity,
    overPct,
    revenue,
    lost: mrr - revenue,
    upkeep,
    salaries,
    net: revenue - upkeep - salaries,
  };
}

/** Turns until the next payday, for the HUD. */
export function paydayIn(state: RunState): number {
  const turns = monthTurns();
  const elapsed = state.sprintTurn % turns;
  return turns - elapsed;
}

/**
 * Payday. Revenue in, subscriptions out, then salaries — in hiring order,
 * and a developer who cannot be paid leaves (see `payTeam`). The order is
 * what makes a saturated month hurt twice: less comes in, and the bills do
 * not care.
 */
export function closeMonth(context: RuleContext): void {
  const { state } = context;
  const report = monthlyReport(state, context.effects);

  state.months += 1;
  state.sprintMonths += 1;

  changeMoney(context, report.revenue, "revenue");
  state.stats.moneyLost += report.lost;
  // Per ten percent over the tolerance: a product that keeps growing past
  // its servers is the one ending a long run, so the bleed grows with the
  // excess — relative, so it reads the same at every order of magnitude,
  // and capped, so being three times over is no worse than twice.
  if (report.overPct > 0) {
    const { outageQualityPer10Pct, outageTolerancePct, outageMaxPct } = BALANCE.economy.infra;
    state.stats.outages += 1;
    emit(context, {
      type: "outage",
      load: report.load,
      capacity: report.capacity,
      overPct: report.overPct,
    });
    const counted = Math.min(report.overPct, outageMaxPct) - outageTolerancePct;
    if (counted > 0) {
      raiseQuality(context, outageQualityPer10Pct * Math.ceil(counted / 10), "outage");
    }
  }
  changeMoney(context, -report.upkeep, "upkeep");

  // Salaries are the team's rule, and a departure is too; the bill is
  // reported here so the log line has the whole month on it.
  const paid = payTeam(context);

  emit(context, {
    type: "month_closed",
    month: state.months,
    revenue: report.revenue,
    lost: report.lost,
    upkeep: report.upkeep,
    salaries: paid,
    money: state.money,
  });

  state.finance.push({
    month: state.months,
    sprint: state.sprint,
    tier: state.tier,
    money: state.money,
    mrr: report.mrr,
    revenue: report.revenue,
    upkeep: report.upkeep,
    salaries: paid,
    net: report.revenue - report.upkeep - paid,
    load: report.load,
    capacity: report.capacity,
    outage: report.overPct > 0,
  });
  if (state.finance.length > BALANCE.economy.historyMonths) {
    state.finance.splice(0, state.finance.length - BALANCE.economy.historyMonths);
  }
}
