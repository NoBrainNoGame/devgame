import "@/lib/server-only";

import { chooseAutopilot } from "@/game/bridge/autopilot";
import { toSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { isActionAvailable } from "@/game/core/rules/actions";
import { TURN_ACTIONS } from "@/game/core/rules/reducer";
import type { PlayerAction, RunState, Seat } from "@/game/core/types";
import { applyEntry, type CompanyEntry } from "@/game/dto/company";

/** Free picks made in a row before the turn pick: a bound, not a goal. */
const MAX_FREE_PICKS = 8;

export interface Driven {
  /** The free actions it took, in order, already applied to `state`. */
  entries: CompanyEntry[];
  /** The turn action it settled on, if there is one worth taking. */
  turn?: PlayerAction;
  state: RunState;
}

/**
 * A seat played by the machine: the supervisor's judgement for a seat that has
 * been gone for three rounds, the plain autopilot (level 0) for a choice that
 * stopped being legal between sending and resolving. It plays like anybody:
 * free actions (start a ticket, check one out, submit, buy) are applied at
 * once as entries of the log, then the turn action is returned for the round.
 */
export function driveSeat(from: RunState, seat: Seat, mode: "supervisor" | "substitute"): Driven {
  let state = from;
  const entries: CompanyEntry[] = [];

  for (let pick = 0; pick < MAX_FREE_PICKS; pick += 1) {
    if (state.phase.kind !== "choose_action") break;
    const snapshot = toSnapshot(state, seat);
    const action =
      mode === "supervisor" ? chooseSupervisor(snapshot)?.action : chooseAutopilot(snapshot, 0);
    if (action === undefined || !isActionAvailable(state, seat, action)) break;
    if (TURN_ACTIONS.has(action.type)) return { entries, turn: action, state };

    const entry: CompanyEntry = { kind: "act", seat, action: action as never };
    state = applyEntry(state, entry).state;
    entries.push(entry);
  }
  return { entries, state };
}
