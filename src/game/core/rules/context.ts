import type { Effects } from "@/game/content";
import { createRng, type Rng } from "@/game/core/rng";
import { gatherEffects } from "@/game/core/rules/modifiers";
import type { GameEvent, RunState } from "@/game/core/types";

/**
 * The working set for one action.
 *
 * `state` is a private copy the reducer made on entry, so rules mutate it
 * freely: the caller's state is never touched. `rng` writes its cursor back
 * into that copy, which is what keeps the random stream part of the save.
 *
 * `effects` is cached because it is read several times per turn and changes
 * only when the player gains something — call `refresh()` then.
 */
export interface RuleContext {
  state: RunState;
  rng: Rng;
  events: GameEvent[];
  effects: Effects;
  refresh(): void;
}

export function createContext(state: RunState): RuleContext {
  const context: RuleContext = {
    state,
    rng: createRng(state.rng),
    events: [],
    effects: gatherEffects(state),
    refresh() {
      context.effects = gatherEffects(context.state);
    },
  };
  return context;
}

export function emit(context: RuleContext, event: GameEvent): void {
  context.events.push(event);
}
