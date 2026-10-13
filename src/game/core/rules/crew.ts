import { CREW_BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { energyMax } from "@/game/core/rules/modifiers";
import { gameOver } from "@/game/core/rules/over";
import { raiseQuality } from "@/game/core/rules/quality";
import { playerScore } from "@/game/core/score";
import type {
  Phase,
  Player,
  RunState,
  Seat,
  SeatPhase,
  SeatState,
  SiteId,
  Ticket,
} from "@/game/core/types";

/**
 * The humans of a run. Solo has one, seat 0, and its player lives on the state
 * as before; a company has as many as its sites hold, each with their own
 * energy, ticket in hand and commit chain. Every rule reaches a player through
 * here, so what differs between the two is decided in this file and not in
 * forty call sites.
 */

/** The only human of a solo run. */
export const SOLO_SEAT: Seat = 0;

export const HEAD_OFFICE: SiteId = "hq";

export function isCrew(state: RunState): boolean {
  return state.crew !== undefined;
}

/** Every seat with a human on it, in seat order. Never `Object.values`: that order is not a rule. */
export function occupiedSeats(state: RunState): Seat[] {
  if (state.crew === undefined) return [SOLO_SEAT];
  return Object.keys(state.crew.seats)
    .map(Number)
    .sort((a, b) => a - b);
}

/** The earliest seat still occupied: who a company-wide question is put to, and who breaks ties. */
export function leadSeat(state: RunState): Seat {
  return occupiedSeats(state)[0] ?? SOLO_SEAT;
}

export function seatState(state: RunState, seat: Seat): SeatState {
  const found = state.crew?.seats[seat];
  if (found === undefined) throw new Error(`Seat ${seat} is vacant`);
  return found;
}

/**
 * The player a seat controls. Throws on a vacant seat: an action for nobody
 * is a bug in whoever sent it, not a no-op.
 */
export function playerOf(state: RunState, seat: Seat): Player {
  if (state.crew !== undefined) return seatState(state, seat).player;
  if (state.player === undefined) throw new Error("A solo run has no player");
  return state.player;
}

/** The seat the current action belongs to; the solo seat when the engine acts alone. */
export function seatOf(context: RuleContext): Seat {
  return context.seat ?? leadSeat(context.state);
}

/** The player the current action belongs to. */
export function actorOf(context: RuleContext): Player {
  return playerOf(context.state, seatOf(context));
}

/**
 * Runs `fn` once per human, with the context pointed at them: the way a rule
 * that touches everybody (a sprint's end, a world event) says so. Solo runs
 * it once, for the one human.
 */
export function forEachSeat(context: RuleContext, fn: (seat: Seat) => void): void {
  const before = context.seat;
  try {
    for (const seat of occupiedSeats(context.state)) {
      context.seat = seat;
      fn(seat);
    }
  } finally {
    context.seat = before;
  }
}

export function ticketHolder(ticket: Ticket): Seat {
  return ticket.holder ?? SOLO_SEAT;
}

/** Who is holding the fewest tickets: where work nobody chose goes. Ties go to the earliest seat. */
export function leastLoadedSeat(state: RunState, except?: Seat): Seat {
  const seats = occupiedSeats(state).filter((seat) => seat !== except);
  const load = new Map<Seat, number>(seats.map((seat) => [seat, 0]));
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.status !== "open" || ticket.assignee !== undefined) continue;
    const holder = ticketHolder(ticket);
    const held = load.get(holder);
    if (held !== undefined) load.set(holder, held + 1);
  }
  let best: Seat | undefined;
  for (const seat of seats) {
    const held = load.get(seat) ?? 0;
    if (best === undefined || held < (load.get(best) ?? 0)) best = seat;
  }
  return best ?? SOLO_SEAT;
}

/** Where a ticket the engine opens goes: to whoever acts in solo, to the lightest desk in a company. */
export function routeSeat(context: RuleContext): Seat {
  return isCrew(context.state) ? leastLoadedSeat(context.state) : seatOf(context);
}

/** Records who holds a ticket, in a company only: a solo ticket has no holder and hashes as before. */
export function assignHolder(state: RunState, ticket: Ticket, seat: Seat): void {
  if (isCrew(state)) ticket.holder = seat;
}

/** What a seat is being asked right now: the company's question, else its own, else nothing. */
export function phaseOf(state: RunState, seat: Seat): Phase {
  if (state.crew === undefined || state.phase.kind !== "choose_action") return state.phase;
  return state.crew.seats[seat]?.pending ?? state.phase;
}

/** The seat's own question, in a company; the run's phase in solo. */
export function setSeatPhase(context: RuleContext, phase: SeatPhase): void {
  const { state } = context;
  if (state.crew === undefined) state.phase = phase;
  else seatState(state, seatOf(context)).pending = phase;
}

export function clearSeatPhase(context: RuleContext): void {
  const { state } = context;
  if (state.crew === undefined) state.phase = { kind: "choose_action" };
  else delete seatState(state, seatOf(context)).pending;
}

export function siteOf(state: RunState, seat: Seat): SiteId {
  return state.crew === undefined ? HEAD_OFFICE : seatState(state, seat).site;
}

/** Humans of a site, in seat order. */
export function siteMembers(state: RunState, site: SiteId): Seat[] {
  return occupiedSeats(state).filter((seat) => siteOf(state, seat) === site);
}

/** People at a site, humans and hired developers: what its seats are counted against. */
export function siteHeadcount(state: RunState, site: SiteId): number {
  const bots = state.devs.filter((dev) => (dev.site ?? HEAD_OFFICE) === site).length;
  return siteMembers(state, site).length + bots;
}

export function siteSeats(state: RunState, site: SiteId): number {
  return state.crew?.sites[site]?.seats ?? 0;
}

/** Commits written by the whole run, which is what the score counts. */
export function commitsOf(state: RunState): number {
  return state.crew === undefined ? playerOf(state, SOLO_SEAT).totalCommits : state.crew.commits;
}

/** One more commit, counted for the run and for whoever wrote it. */
export function countCommit(context: RuleContext): void {
  actorOf(context).totalCommits += 1;
  if (context.state.crew !== undefined) context.state.crew.commits += 1;
}

export function emptyPlayer(max: number): Player {
  return {
    ticketId: null,
    energy: max,
    energyMax: max,
    totalCommits: 0,
    zeroEnergyStreak: 0,
    aiChain: 0,
    turnsSinceFreeReview: 0,
    freeRefactor: false,
    docsCharges: 0,
  };
}

/** A human takes a seat, with a full tank and an empty desk. */
export function joinSeat(context: RuleContext, name: string, site: SiteId): Seat {
  const { state } = context;
  const crew = state.crew;
  if (crew === undefined) throw new Error("Only a company has seats");
  if (crew.sites[site] === undefined) throw new Error(`There is no site ${site}`);
  if (siteHeadcount(state, site) >= siteSeats(state, site)) {
    throw new Error(`Site ${site} is full: pick another or buy a site`);
  }

  const seat = crew.nextSeat;
  crew.nextSeat += 1;
  crew.seats[seat] = {
    name,
    site,
    joinedTurn: state.turn,
    player: emptyPlayer(energyMax(state, context.effects)),
    contribution: { pointsDelivered: 0, ticketsDelivered: 0, sprints: 0 },
  };
  emit(context, { type: "seat_joined", seat, name, site });
  return seat;
}

/**
 * A human leaves, by choice or burnt out. Their open tickets go to the
 * lightest desk left; with nobody left the company is dissolved.
 */
export function leaveSeat(context: RuleContext, seat: Seat, reason: "left" | "burnout"): void {
  const { state } = context;
  const crew = state.crew;
  if (crew === undefined) throw new Error("Only a company has seats");
  const gone = seatState(state, seat);

  crew.left[seat] = { name: gone.name, score: playerScore(state, seat) };
  delete crew.seats[seat];
  emit(context, { type: "seat_left", seat, name: gone.name, reason });

  if (occupiedSeats(state).length === 0) {
    gameOver(context, "dissolved");
    return;
  }

  for (const ticket of Object.values(state.tickets)) {
    if (ticket.status !== "open" || ticket.assignee !== undefined) continue;
    if (ticketHolder(ticket) !== seat) continue;
    ticket.holder = leastLoadedSeat(state);
  }
  // Somebody holds what was left, so each desk has a ticket in hand again.
  for (const other of occupiedSeats(state)) {
    const player = playerOf(state, other);
    if (player.ticketId !== null) continue;
    const next = Object.values(state.tickets).find(
      (ticket) =>
        ticket.status === "open" && ticket.assignee === undefined && ticketHolder(ticket) === other,
    );
    if (next !== undefined) player.ticketId = next.id;
  }
}

/** A round with no action: a rest that gives nothing back, and patience lost. */
export function missRound(context: RuleContext, seat: Seat): void {
  const before = context.seat;
  context.seat = seat;
  try {
    emit(context, { type: "seat_missed", seat });
    raiseQuality(context, CREW_BALANCE.crew.missPatience, "rest");
  } finally {
    context.seat = before;
  }
}
