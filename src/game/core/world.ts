import { WORLD_EVENT_IDS, type WorldEventId } from "@/game/content";
import { CREW_BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
import { createRng, type RngState } from "@/game/core/rng";
import { companyPower } from "@/game/core/rules/economy";
import { computeScore } from "@/game/core/score";
import type { RunState } from "@/game/core/types";

/**
 * The world a set of companies lives in. Pure and seeded like a run: it draws
 * from its own cursor, never reads the clock, and the server owns the only
 * copy. The companies play against each other only through their power, which
 * the market of each reads as its rivals.
 */

export type CompanyId = string;

/** What the world knows of a company: enough to rank it and to be a rival. */
export interface CompanyCard {
  id: CompanyId;
  name: string;
  /** Revenue plus users, as the market weighs it. */
  power: number;
  score: number;
  alive: boolean;
}

export interface WorldState {
  seed: string;
  rng: RngState;
  round: number;
  /** The round the last event fell in, for the cooldown. */
  lastEventRound: number;
  companies: Record<CompanyId, CompanyCard>;
}

export function createWorld(seed: string): WorldState {
  return {
    seed,
    rng: { s: fnv1a(`world:${seed}`) | 0 },
    round: 0,
    lastEventRound: -CREW_BALANCE.world.eventCooldownRounds,
    companies: {},
  };
}

/** The card of a company, read from its state. */
export function cardOf(id: CompanyId, state: RunState): CompanyCard {
  return {
    id,
    name: state.crew?.name ?? id,
    power: companyPower(state),
    score: computeScore(state),
    alive: state.phase.kind !== "game_over",
  };
}

/** Puts a card in the world, replacing the company's previous one. Returns a new world. */
export function withCard(world: WorldState, card: CompanyCard): WorldState {
  return { ...world, companies: { ...world.companies, [card.id]: card } };
}

export function withoutCompany(world: WorldState, id: CompanyId): WorldState {
  const companies = { ...world.companies };
  delete companies[id];
  return { ...world, companies };
}

/**
 * One tick of the world. Two draws, always, in this order — whether an event
 * falls and which — so the stream does not depend on how many companies are
 * standing. An event falls only once the cooldown has passed.
 */
export function stepWorld(world: WorldState): { world: WorldState; event?: WorldEventId } {
  const rng = { ...world.rng };
  const draw = createRng(rng);
  const rolled = draw.chance(CREW_BALANCE.world.eventChancePct);
  const picked = draw.pick(WORLD_EVENT_IDS);

  const round = world.round + 1;
  const cooled = round - world.lastEventRound >= CREW_BALANCE.world.eventCooldownRounds;
  const falls = rolled && cooled;
  const next: WorldState = {
    ...world,
    rng,
    round,
    lastEventRound: falls ? round : world.lastEventRound,
  };
  return falls ? { world: next, event: picked } : { world: next };
}

/**
 * What a company's round is told about the world: the power of every other
 * company still standing, sorted so the list does not depend on the order
 * the companies were registered in, and the event if one fell.
 */
export function worldInputFor(
  world: WorldState,
  id: CompanyId,
  event?: WorldEventId,
): { rivals: number[]; event?: WorldEventId } {
  const rivals = Object.values(world.companies)
    .filter((card) => card.id !== id && card.alive)
    .map((card) => card.power)
    .sort((a, b) => a - b);
  return event === undefined ? { rivals } : { rivals, event };
}

/** Companies best first; ties go to the older id, so the order is stable. */
export function rankCompanies(world: WorldState): CompanyCard[] {
  return Object.values(world.companies).sort(
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
