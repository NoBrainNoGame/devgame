import { DEV_RANK, type DevRank, type Effects, nextRank, TICKET_KIND } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { changeMoney } from "@/game/core/rules/money";
import {
  backlogTickets,
  openTickets,
  settleCurrent,
  sortedTickets,
} from "@/game/core/rules/tickets";
import { completeMerge, writeTeamCommit } from "@/game/core/rules/write";
import type { Dev, DevId, DevSource, RunState, Ticket } from "@/game/core/types";

/**
 * The hired team.
 *
 * A developer takes tickets from the backlog on their own, writes a commit on
 * each every turn, and lands them without a review or a merge from you. Their
 * commits are craft, read, and free of debt: what you pay for is exactly the
 * work you do not have to do, and what you pay is a salary every month.
 *
 * Their tickets are not yours. They do not count in the work in progress,
 * they cannot be checked out, and their merges do not move `dev` under your
 * feet — the team rebases its own work under yours, or hiring would raise the
 * price of every merge you make and punish itself.
 *
 * Nothing here draws randomness. A team's turn is a pure function of the
 * board, which is what keeps a hired run replayable.
 */

export function ticketsOf(state: RunState, devId: DevId): Ticket[] {
  return openTickets(state).filter((ticket) => ticket.assignee === devId);
}

export function devCapacity(dev: Dev, effects: Effects): number {
  return DEV_RANK[dev.rank].capacity + effects.devCapacityBonus;
}

export function hireCostFor(effects: Effects, rank: DevRank): number {
  return Math.round((DEV_RANK[rank].hireCost * (100 - effects.hiringDiscountPct)) / 100);
}

/** Seats for developers: the head office plus every site bought. */
export function maxSeats(effects: Effects): number {
  return BALANCE.team.baseSeats + effects.teamSeats;
}

export function canHire(state: RunState, effects: Effects, rank: DevRank): boolean {
  return (
    DEV_RANK[rank].tier <= state.tier &&
    state.devs.length < maxSeats(effects) &&
    hireCostFor(effects, rank) <= state.money
  );
}

/**
 * Puts a developer on the roster. The one door for hiring, for a site that
 * brings its team and for an acquisition: whoever pays, the dev is the same.
 */
export function addDev(context: RuleContext, rank: DevRank, source?: DevSource): Dev {
  const { state } = context;
  const dev: Dev = {
    id: `d${state.nextDevSerial}`,
    rank,
    hiredRank: rank,
    delivered: 0,
    hiredSprint: state.sprint,
  };
  state.nextDevSerial += 1;
  state.devs.push(dev);
  state.stats.hires += 1;

  emit(context, {
    type: "hired",
    devId: dev.id,
    rank,
    ...(source === undefined ? {} : { source }),
  });
  return dev;
}

export function hireDev(context: RuleContext, rank: DevRank): Dev {
  const { state } = context;
  if (DEV_RANK[rank].tier > state.tier) {
    throw new Error(`A ${rank} is hired from tier ${DEV_RANK[rank].tier}`);
  }
  if (state.devs.length >= maxSeats(context.effects)) {
    throw new Error(`The team is full at ${maxSeats(context.effects)}`);
  }
  const cost = hireCostFor(context.effects, rank);
  if (cost > state.money) throw new Error(`A ${rank} costs ${cost}, you have ${state.money}`);

  changeMoney(context, -cost, "hire");
  return addDev(context, rank);
}

/**
 * A developer picks a ticket up. Distinct from `openTicket` on purpose: it
 * takes a column like any open ticket, but it never becomes the ticket in
 * your hand and it is not something the board did to you.
 */
export function assignTicket(context: RuleContext, ticket: Ticket, dev: Dev): void {
  const { state } = context;
  if (ticket.status !== "backlog") return;

  ticket.status = "open";
  ticket.devMergesAtOpen = state.devMerges;
  ticket.assignee = dev.id;

  emit(context, { type: "ticket_assigned", ticketId: ticket.id, devId: dev.id });
}

/** The oldest ticket waiting that a developer takes: never a hotfix, a refactor, or a VIP's. */
function nextForTeam(state: RunState): Ticket | undefined {
  return backlogTickets(state).find(
    (ticket) => TICKET_KIND[ticket.kind].teamTakes && ticket.mustWrite === undefined,
  );
}

/** Every developer with a free hand takes what is waiting, oldest first. */
export function pullTeam(context: RuleContext): void {
  const { state } = context;
  for (const dev of state.devs) {
    while (ticketsOf(state, dev.id).length < devCapacity(dev, context.effects)) {
      const ticket = nextForTeam(state);
      if (ticket === undefined) return;
      assignTicket(context, ticket, dev);
    }
  }
}

/**
 * The team's turn, at the end of yours: pick up, write, land. A ticket that
 * fills lands at once — the team does not open pull requests on you.
 *
 * A developer's speed is a budget for the turn, spent on the oldest ticket
 * first and spilling into the next: a senior holding three tickets is not
 * three times faster, they take three times more off the backlog. Rank is
 * breadth, tooling and coaching are speed.
 */
export function workTeam(context: RuleContext): void {
  const { state } = context;
  pullTeam(context);

  for (const dev of state.devs) {
    // A rank is a speed: a senior fills three points a turn where a junior
    // fills one, which is what the price gap pays for.
    let budget = DEV_RANK[dev.rank].speed + context.effects.devSpeedBonus;
    for (const ticket of ticketsOf(state, dev.id)) {
      if (budget <= 0) break;
      const points = Math.min(budget, ticket.points - ticket.filled);
      if (points <= 0) continue;
      budget -= points;

      writeTeamCommit(context, ticket, dev.id, points);
      if (ticket.filled < ticket.points) continue;

      completeMerge(context, ticket, { byTeam: dev.id });
      dev.delivered += 1;
      promote(context, dev);
    }
  }
}

/** A rank every few tickets, up to senior. */
function promote(context: RuleContext, dev: Dev): void {
  if (dev.delivered % BALANCE.team.promoteEvery !== 0) return;
  const rank = nextRank(dev.rank);
  if (rank === dev.rank) return;
  dev.rank = rank;
  emit(context, { type: "dev_promoted", devId: dev.id, rank });
}

/**
 * Payday for the team, in hiring order. A developer the money does not
 * stretch to leaves, and their tickets are yours now — open, in the same
 * column, with whatever was written on them. Returns what was actually paid.
 */
export function payTeam(context: RuleContext): number {
  const { state } = context;
  let paid = 0;
  for (const dev of [...state.devs]) {
    const salary = DEV_RANK[dev.rank].salary;
    if (salary <= state.money) {
      changeMoney(context, -salary, "salary");
      paid += salary;
    } else {
      releaseDev(context, dev);
    }
  }
  return paid;
}

export function releaseDev(context: RuleContext, dev: Dev): void {
  const { state } = context;
  const handedBack = ticketsOf(state, dev.id).map((ticket) => ticket.id);
  for (const ticket of sortedTickets(state)) {
    if (ticket.assignee === dev.id) delete ticket.assignee;
  }
  state.devs = state.devs.filter((other) => other.id !== dev.id);
  state.stats.devsLeft += 1;

  emit(context, { type: "dev_left", devId: dev.id, ticketIds: handedBack });
  settleCurrent(context);
}
