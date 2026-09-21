import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import type { GameEvent, NodeKind, PlayerAction, RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

/** A run at turn one, with the default unlocks, for a named seed. */
export function newRun(
  seed: string,
  profileId: "junior" | "senior" | "vibe_coder" | "devops" = "junior",
): RunState {
  return createRun({ seed, mode: "classic", profileId, version: SAVE_VERSION });
}

/** A copy of `state` that has learned to review. */
export function withReviewSkill(state: RunState): RunState {
  const next = structuredClone(state);
  if (!next.skills.includes("code_review")) next.skills.push("code_review");
  return next;
}

/**
 * A copy that can review *right now*: the skill learned, and one unread AI
 * commit for it to find. Review is doubly gated — learned, and with something
 * to read — so a test that wants to exercise it has to say so rather than
 * assume it is always on the table.
 */
export function makeReviewable(state: RunState): RunState {
  const next = withReviewSkill(state);
  next.player.aiHistory = [{ nodeId: next.player.nodeId, reviewed: false }];
  return next;
}

/**
 * Drives a run until the player is standing on a node of `kind`, ready to
 * commit on it. Detours are rare by design, so this walks several seeds rather
 * than stubbing the map: a real seed proves the node is reachable in a game
 * that could actually happen.
 */
export function standingOn(kind: NodeKind, options: { prefix?: string } = {}): RunState {
  return onKind(kind, options).state;
}

/**
 * The same, but the craft commit on that node is known to have landed — a
 * detour that failed its roll resolves nothing, and a test about what the node
 * *does* has nothing to assert against.
 */
export function committedOn(
  kind: NodeKind,
  options: { prefix?: string; where?: (state: RunState) => boolean } = {},
): { before: RunState; after: RunState; events: GameEvent[] } {
  const { state } = onKind(kind, { ...options, mustResolve: true });
  const result = applyAction(state, { type: "commit", mode: "craft" });
  return { before: state, after: result.state, events: result.events };
}

function onKind(
  kind: NodeKind,
  options: { prefix?: string; mustResolve?: boolean; where?: (state: RunState) => boolean } = {},
): { state: RunState } {
  const prefix = options.prefix ?? kind;

  for (let attempt = 0; attempt < 800; attempt += 1) {
    let state = newRun(`${prefix}-${attempt}`);

    for (let step = 0; step < 300; step += 1) {
      if (state.phase.kind === "game_over") break;

      if (
        state.phase.kind === "choose_action" &&
        state.nodes[state.player.nodeId]?.kind === kind &&
        (options.where?.(state) ?? true)
      ) {
        if (options.mustResolve !== true) return { state };

        // The roll has to have *succeeded*, not merely let the node through:
        // the failure table can resolve a node anyway, and a node that only
        // survived is not a node that did what it promised.
        const probe = applyAction(state, { type: "commit", mode: "craft" });
        const roll = probe.events.find((event) => event.type === "roll");
        const landed =
          (roll === undefined || (roll.type === "roll" && roll.success)) &&
          probe.events.some(
            (event) => event.type === "node_done" && event.nodeId === state.player.nodeId,
          );
        if (landed) return { state };
        break;
      }

      const legal = getAvailableActions(state);
      const wanted = legal.find(
        (action) => action.type === "move" && state.nodes[action.nodeId]?.kind === kind,
      );
      const action =
        wanted ?? legal.find((a) => a.type === "commit" && a.mode === "ai") ?? legal[0];
      if (action === undefined) break;

      state = applyAction(state, action).state;
    }
  }

  throw new Error(`No seed out of 800 put the player on a ${kind} node`);
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
