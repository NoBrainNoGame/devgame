import { featureNameKey, type SkillId, TICKET_KIND, type TicketKind } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { tierScale } from "@/game/core/rules/tier";
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
export function ticketsFor(sprint: number, tier: number): number {
  const { base, growEvery, maxPerSprint, perTier } = BALANCE.tickets;
  // The cap holds the sprint curve; the tier term has no cap, because the
  // backlog is what ends a run the servers no longer can.
  return Math.min(maxPerSprint, base + Math.floor((sprint - 1) / growEvery)) + perTier * tier;
}

/** Brings this sprint's tickets into the backlog. */
export function arriveTickets(context: RuleContext, skillPool: readonly SkillId[]): void {
  const pool = [...skillPool];
  const count = ticketsFor(context.state.sprint, context.state.tier);

  for (let i = 0; i < count; i += 1) arriveTicket(context, pool, i === 0);
  arriveDebtTicket(context);
}

/**
 * The codebase asks for a refactor of its own accord once the debt is high
 * enough — one at a time, never forced, and drawn from nothing: whether it
 * arrives is a fact of the state, not a roll.
 */
function arriveDebtTicket(context: RuleContext): void {
  const { state } = context;
  const { debt } = BALANCE.tickets.kinds;
  if (state.debt < debt.threshold) return;
  const pending = Object.values(state.tickets).some(
    (ticket) => ticket.kind === "debt" && (ticket.status === "backlog" || ticket.status === "open"),
  );
  if (pending) return;

  const id: TicketId = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;
  const ticket: Ticket = {
    id,
    kind: "debt",
    status: "backlog",
    points: debt.points,
    filled: 0,
    rework: 0,
    debtAdded: 0,
    rejections: 0,
    tier: state.tier,
    load: 0,
    mrr: 0,
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
    mustWrite: "refactor",
  };
  state.tickets[id] = ticket;
  emit(context, { type: "ticket_arrived", ticketId: id });
}

/** One more ticket, now. Returns it so the caller may open it on the spot. */
export function arriveTicket(context: RuleContext, pool: SkillId[], guaranteed: boolean): Ticket {
  const ticket = drawTicket(context, pool, guaranteed);
  context.state.tickets[ticket.id] = ticket;
  emit(context, { type: "ticket_arrived", ticketId: ticket.id });
  return ticket;
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
  const { kinds } = tickets;

  // What kind of work it is: the sprint's first ticket is always a feature,
  // the rest are drawn by the tier's weights — a draw made even for the
  // first, so the stream is the same whichever ticket is looked at.
  const weights = kinds.weights[Math.min(state.tier, kinds.weights.length - 1)] ?? kinds.weights[0];
  const drawnKind = rng.weighted(
    (Object.keys(weights ?? {}) as (keyof NonNullable<typeof weights>)[]).map((value) => ({
      value,
      weight: weights?.[value] ?? 0,
    })),
  );
  const kind: TicketKind = guaranteed ? "feature" : drawnKind;
  const def = TICKET_KIND[kind];

  // The same draw whatever the build: the effect only moves the threshold.
  const rolled = rng.chance(tickets.skillPct + context.effects.skillTicketPoints);
  const wantsSkill = pool.length > 0 && def.grantsSkill && (guaranteed || rolled);
  const skillId = wantsSkill ? rng.pick(pool) : undefined;
  if (skillId !== undefined) pool.splice(pool.indexOf(skillId), 1);

  const range =
    kind === "client_bug"
      ? kinds.clientBug.points
      : kind === "migration"
        ? kinds.migration.points
        : tickets.points;
  let points = rng.int(range.min, range.max);
  if (skillId !== undefined) {
    points += rng.int(tickets.skillExtraPoints.min, tickets.skillExtraPoints.max);
  }
  if (kind === "vip") points += kinds.vip.extraPoints;

  // What it will earn every month once shipped: the bigger the feature, the
  // more it pays, with a jitter so two tickets of a size are not the same.
  // The whole of it is scaled by the tier it arrives at, after the draws, so
  // the stream of rolls is the same at every order of magnitude.
  const { economy } = BALANCE;
  const jitter = rng.int(economy.mrrJitter.min, economy.mrrJitter.max);
  const baseMrr =
    (points * economy.mrrPerPoint + jitter) * tierScale(state.tier, economy.tier.mrrGrowth);
  const mrr = !def.earnsMrr ? 0 : kind === "vip" ? baseMrr * kinds.vip.mrrFactor : baseMrr;
  const load = !def.earnsMrr
    ? 0
    : points *
      economy.infra.usersPerPoint *
      tierScale(Math.min(state.tier, economy.tier.loadTierCap), economy.tier.loadGrowth);

  const id: TicketId = `t${state.nextTicketSerial}`;
  state.nextTicketSerial += 1;

  return {
    id,
    kind,
    status: "backlog",
    points,
    filled: 0,
    rework: 0,
    debtAdded: 0,
    rejections: 0,
    ...(skillId === undefined ? {} : { skillId }),
    tier: state.tier,
    load,
    mrr,
    sprintArrived: state.sprint,
    devMergesAtOpen: 0,
    nodeIds: [],
    ...(def.earnsMrr ? { nameKey: featureNameKey(state.tier, fnv1a(`${state.seed}:${id}`)) } : {}),
    ...(def.deadlineSprints === undefined
      ? {}
      : { deadlineSprint: state.sprint + def.deadlineSprints - 1 }),
  };
}
