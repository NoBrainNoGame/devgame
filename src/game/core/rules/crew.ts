import type { RuleContext } from "@/game/core/rules/context";
import type { Player, RunState, Seat } from "@/game/core/types";

/** The only human of a solo run. */
export const SOLO_SEAT: Seat = 0;

/**
 * The player a seat controls. Every rule goes through here instead of reading
 * `state.player`, so a company, where each seat has its own, changes this one
 * function and not forty call sites.
 */
export function playerOf(state: RunState, _seat: Seat): Player {
  return state.player;
}

/** Every seat with a human on it, in seat order. Never `Object.values`: that order is not a rule. */
export function occupiedSeats(_state: RunState): Seat[] {
  return [SOLO_SEAT];
}

/**
 * The seat company-wide readers consult when they need one player: the
 * earliest seat still occupied.
 */
export function leadSeat(state: RunState): Seat {
  return occupiedSeats(state)[0] ?? SOLO_SEAT;
}

/** Commits written by the whole run, which is what the score counts. */
export function commitsOf(state: RunState): number {
  return state.player.totalCommits;
}

/** The seat the current action belongs to; the solo seat when the engine acts alone. */
export function seatOf(context: RuleContext): Seat {
  return context.seat ?? SOLO_SEAT;
}

/** The player the current action belongs to; the solo player when the engine acts alone. */
export function actorOf(context: RuleContext): Player {
  return playerOf(context.state, seatOf(context));
}

/** One more commit, counted for the run and for whoever wrote it. */
export function countCommit(context: RuleContext): void {
  actorOf(context).totalCommits += 1;
}
