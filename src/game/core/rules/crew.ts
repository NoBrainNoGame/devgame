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

/** The player the current action belongs to; the solo player when the engine acts alone. */
export function actorOf(context: RuleContext): Player {
  return playerOf(context.state, context.seat ?? SOLO_SEAT);
}
