import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import type { GameEvent, PlayerAction, RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

/** A run at turn one, with the default unlocks, for a named seed. */
export function newRun(
  seed: string,
  profileId: "junior" | "senior" | "vibe_coder" | "devops" = "junior",
): RunState {
  return createRun({ seed, mode: "classic", profileId, version: SAVE_VERSION });
}

export interface PlayResult {
  state: RunState;
  actions: PlayerAction[];
  events: GameEvent[];
}

/**
 * Plays until `stop` says so, the run ends, or `limit` actions have been taken.
 * `pick` chooses from the legal actions, defaulting to the first one.
 */
export function play(
  start: RunState,
  options: {
    limit?: number;
    pick?: (state: RunState, actions: PlayerAction[]) => PlayerAction | undefined;
    stop?: (state: RunState, events: GameEvent[]) => boolean;
  } = {},
): PlayResult {
  const limit = options.limit ?? 200;
  let state = start;
  const taken: PlayerAction[] = [];
  const seen: GameEvent[] = [];

  for (let i = 0; i < limit; i++) {
    if (state.phase.kind === "game_over") break;

    const legal = getAvailableActions(state);
    if (legal.length === 0) break;

    const action = options.pick?.(state, legal) ?? legal[0];
    if (action === undefined) break;

    const result = applyAction(state, action);
    state = result.state;
    taken.push(action);
    seen.push(...result.events);

    if (options.stop?.(state, result.events) === true) break;
  }

  return { state, actions: taken, events: seen };
}

/** Prefers the first action matching any predicate, in order. */
export function prefer(
  ...matchers: ((action: PlayerAction) => boolean)[]
): (state: RunState, actions: PlayerAction[]) => PlayerAction | undefined {
  return (_state, actions) => {
    for (const matcher of matchers) {
      const found = actions.find(matcher);
      if (found !== undefined) return found;
    }
    return actions[0];
  };
}

export const isCommit =
  (mode: "craft" | "ai") =>
  (action: PlayerAction): boolean =>
    action.type === "commit" && action.mode === mode;

export const isType =
  (type: PlayerAction["type"]) =>
  (action: PlayerAction): boolean =>
    action.type === type;

/**
 * Finds a seed whose run satisfies `predicate` within `limit` actions. Tests
 * use this instead of stubbing the PRNG: a real seed proves the rule fires in
 * a game that could actually happen, and it stays deterministic.
 */
export function findSeed(
  predicate: (result: PlayResult) => boolean,
  options: {
    attempts?: number;
    prefix?: string;
    pick?: (state: RunState, actions: PlayerAction[]) => PlayerAction | undefined;
    limit?: number;
    /** Halts the run as soon as this holds, so transient phases can be caught. */
    stop?: (state: RunState, events: GameEvent[]) => boolean;
  } = {},
): PlayResult {
  const attempts = options.attempts ?? 400;
  const prefix = options.prefix ?? "seed";

  for (let i = 0; i < attempts; i++) {
    const result = play(newRun(`${prefix}-${i}`), {
      ...(options.pick === undefined ? {} : { pick: options.pick }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.stop === undefined ? {} : { stop: options.stop }),
    });
    if (predicate(result)) return result;
  }

  throw new Error(`No seed out of ${attempts} produced the situation under test`);
}

export function eventsOfType<T extends GameEvent["type"]>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}
