import {
  DEV_NAMES,
  DEV_RANK,
  type DevRank,
  type Effects,
  nextRank,
  TICKET_KIND,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { changeMoney } from "@/game/core/rules/money";
import {
  backlogTickets,
  obstaclesOf,
  openTickets,
  settleCurrent,
  sortedTickets,
} from "@/game/core/rules/tickets";
import { completeMerge, completeObstacle, writeTeamCommit } from "@/game/core/rules/write";
import type { Dev, DevId, DevSource, RunState, Ticket, TicketId } from "@/game/core/types";

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

/** The fee here and now: nothing while a bonus pays for the next hire. */
export function hireCostOf(state: RunState, effects: Effects, rank: DevRank): number {
  return state.boosts.freeHire ? 0 : hireCostFor(effects, rank);
}

export function canHire(state: RunState, effects: Effects, rank: DevRank): boolean {
  return (
    DEV_RANK[rank].tier <= state.tier &&
    state.devs.length < maxSeats(effects) &&
    hireCostOf(state, effects, rank) <= state.money
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
    name: nameFor(state, `d${state.nextDevSerial}`),
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

/**
 * A first name for a new hire: hashed from the seed and the id rather than
 * drawn, so hiring still takes nothing from the PRNG, and the next free one
 * along when the roster already has it.
 */
function nameFor(state: RunState, id: DevId): string {
  const taken = new Set(state.devs.map((dev) => dev.name));
  const start = Math.abs(fnv1a(`${state.seed}:${id}`)) % DEV_NAMES.length;
  for (let step = 0; step < DEV_NAMES.length; step += 1) {
    const name = DEV_NAMES[(start + step) % DEV_NAMES.length];
    if (name !== undefined && !taken.has(name)) return name;
  }
  return DEV_NAMES[start] ?? "Dev";
}

export function hireDev(context: RuleContext, rank: DevRank): Dev {
  const { state } = context;
  if (DEV_RANK[rank].tier > state.tier) {
    throw new Error(`A ${rank} is hired from tier ${DEV_RANK[rank].tier}`);
  }
  if (state.devs.length >= maxSeats(context.effects)) {
    throw new Error(`The team is full at ${maxSeats(context.effects)}`);
  }
  const cost = hireCostOf(state, context.effects, rank);
  if (cost > state.money) throw new Error(`A ${rank} costs ${cost}, you have ${state.money}`);

  state.boosts.freeHire = false;
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
    // What stands in the way first: an obstacle holds the feature it is on.
    const held = ticketsOf(state, dev.id);
    const ordered = [
      ...held.filter((ticket) => ticket.parentId !== undefined),
      ...held.filter((ticket) => ticket.parentId === undefined),
    ];
    // What each ticket gets this turn: everything to the first with room, so
    // a ticket lands as soon as it can — or, in a showcase, a point each in
    // turn, so the columns live side by side and the graph shows a team.
    const share = new Map<TicketId, number>();
    const roomOf = (ticket: Ticket): number =>
      ticket.points - ticket.filled - (share.get(ticket.id) ?? 0);
    if (state.showcase !== null) {
      let progress = true;
      while (budget > 0 && progress) {
        progress = false;
        for (const ticket of ordered) {
          if (budget <= 0 || roomOf(ticket) <= 0) continue;
          share.set(ticket.id, (share.get(ticket.id) ?? 0) + 1);
          budget -= 1;
          progress = true;
        }
      }
    } else {
      for (const ticket of ordered) {
        if (budget <= 0) break;
        const points = Math.min(budget, roomOf(ticket));
        if (points <= 0) continue;
        share.set(ticket.id, points);
        budget -= points;
      }
    }
    for (const ticket of ordered) {
      const points = share.get(ticket.id) ?? 0;
      if (points > 0) writeTeamCommit(context, ticket, dev.id, points);
      if (ticket.filled < ticket.points) continue;
      // Full: an obstacle lands on its feature; a feature lands on `dev`,
      // unless an obstacle still holds it — then it waits, full, for the
      // turn the obstacle goes.
      if (ticket.parentId !== undefined) {
        completeObstacle(context, ticket, { byTeam: dev.id });
        continue;
      }
      if (obstaclesOf(state, ticket).length > 0) continue;

      completeMerge(context, ticket, { byTeam: dev.id });
      dev.delivered += 1;
      promote(context, dev);
    }
  }
}

/** A rank every few tickets, up to senior. A showcase's team stays what it was cast as. */
function promote(context: RuleContext, dev: Dev): void {
  if (context.state.showcase !== null) return;
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

/**
 * A developer leaves — unpaid, or written out by an event — and their tickets
 * are handed back. In a showcase nobody leaves: the team is the picture.
 */
export function releaseDev(context: RuleContext, dev: Dev): void {
  const { state } = context;
  if (state.showcase !== null) return;
  const handedBack = ticketsOf(state, dev.id).map((ticket) => ticket.id);
  for (const ticket of sortedTickets(state)) {
    if (ticket.assignee === dev.id) delete ticket.assignee;
  }
  state.devs = state.devs.filter((other) => other.id !== dev.id);
  state.stats.devsLeft += 1;

  emit(context, { type: "dev_left", devId: dev.id, name: dev.name, ticketIds: handedBack });
  settleCurrent(context);
}
