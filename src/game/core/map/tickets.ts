import { CRITERION_KINDS, type CriterionKind, SKILLS, type SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import type { Ticket, TicketId } from "@/game/core/types";

/**
 * The backlog, as it fills.
 *
 * Tickets are the whole map now: there is no graph to generate ahead of the
 * player, only work that arrives, and the commits that work is made of are
 * written one at a time as it is done. What is drawn here is *what the ticket
 * asks for* — points, criteria, a reward — and everything is drawn from the
 * run's PRNG in a fixed order, so the same seed always gets the same board.
 *
 * Every draw is made whether or not its result can be used. Skipping one when
 * the skill pool is empty would make the stream depend on the account's
 * unlocks in a second way, and a replay would drift.
 */

/** How many tickets a sprint brings. More as the project goes on. */
export function ticketsFor(sprint: number): number {
  const { base, growEvery, maxPerSprint } = BALANCE.tickets;
  return Math.min(maxPerSprint, base + Math.floor((sprint - 1) / growEvery));
}

/** Brings this sprint's tickets into the backlog. */
export function arriveTickets(context: RuleContext, skillPool: readonly SkillId[]): void {
  const pool = [...skillPool];
  const count = ticketsFor(context.state.sprint);

  for (let i = 0; i < count; i += 1) {
    const ticket = drawTicket(context, pool, i === 0);
    context.state.tickets[ticket.id] = ticket;
    emit(context, { type: "ticket_arrived", ticketId: ticket.id });
  }
}

/**
 * One ticket. The skill is drawn first, because it is what the ticket costs:
 * a ticket that grants one is strictly bigger than the plain one beside it —
 * that is the trade the whole choice is made of.
 *
 * The first ticket of a sprint always carries a skill while the pool has one.
 * A sprint with nothing to build towards is a sprint with no reason to pick
 * one ticket over another.
 */
function drawTicket(context: RuleContext, pool: SkillId[], guaranteed: boolean): Ticket {
  const { state, rng } = context;
  const { tickets } = BALANCE;

  const rolled = rng.chance(tickets.skillPct);
  const wantsSkill = pool.length > 0 && (guaranteed || rolled);
  const skillId = wantsSkill ? rng.pick(pool) : undefined;
  if (skillId !== undefined) pool.splice(pool.indexOf(skillId), 1);

  let points = rng.int(tickets.points.min, tickets.points.max);
  if (skillId !== undefined) {
    points += rng.int(tickets.skillExtraPoints.min, tickets.skillExtraPoints.max);
  }

  const criteria = drawCriteria(context, canLearnReview(context));

  const id: TicketId = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;

  return {
    id,
    kind: "feature",
    status: "backlog",
    points,
    filled: 0,
    criteria,
    ...(skillId === undefined ? {} : { skillId }),
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
  };
}

function drawCriteria(context: RuleContext, reviewable: boolean): CriterionKind[] {
  const { rng } = context;
  const { criteriaCount, criteriaWeights } = BALANCE.tickets;

  const count = rng.int(criteriaCount.min, criteriaCount.max);
  const chosen: CriterionKind[] = [];

  for (let i = 0; i < count; i += 1) {
    // `reviewed` on a ticket the run can never review is a ticket that can
    // never merge, which is not difficulty, it is a dead end.
    const entries = CRITERION_KINDS.filter((kind) => !chosen.includes(kind))
      .filter((kind) => kind !== "reviewed" || reviewable)
      .map((kind) => ({ value: kind, weight: criteriaWeights[kind] }));
    if (entries.length === 0) break;

    chosen.push(rng.weighted(entries));
  }

  return chosen.sort();
}

/**
 * Whether this run can ever review: it already knows how, or a skill that
 * teaches it is among the account's unlocks and may still turn up.
 */
function canLearnReview(context: RuleContext): boolean {
  if (context.effects.canReview) return true;
  return context.state.unlockedSkills.some((id) => SKILLS[id].effects.canReview === true);
}
