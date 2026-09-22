import { BALANCE } from "@/game/core/balance";
import { DEV_LANE } from "@/game/core/map/layout";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { currentTicket, offersOf } from "@/game/core/rules/tickets";
import { createRun } from "@/game/core/run";
import type {
  CommitMode,
  DetourKind,
  GameEvent,
  PlayerAction,
  RunState,
  Ticket,
} from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

/** A run at turn one, with the default unlocks, for a named seed. */
export function newRun(
  seed: string,
  profileId: "junior" | "senior" | "vibe_coder" | "devops" = "junior",
): RunState {
  return createRun({ seed, mode: "classic", profileId, version: SAVE_VERSION });
}

/** A run with a ticket in hand: the first of the backlog, just started. */
export function inHand(seed: string): RunState {
  const state = newRun(seed);
  const start = getAvailableActions(state).find((action) => action.type === "start");
  if (start === undefined) throw new Error(`${seed}: the backlog is empty at turn one`);
  return applyAction(state, start).state;
}

/** The ticket being written, which a test about a commit needs to exist. */
export function ticketInHand(state: RunState): Ticket {
  const ticket = currentTicket(state);
  if (ticket === null) throw new Error("expected a ticket in hand");
  return ticket;
}

/** A copy of `state` that has learned to review. */
export function withReviewSkill(state: RunState): RunState {
  const next = structuredClone(state);
  if (!next.skills.includes("code_review")) next.skills.push("code_review");
  return next;
}

/**
 * A copy that can review *right now*: the skill learned, and one unread
 * machine-written commit on the ticket in hand for it to find. Review is
 * doubly gated — learned, and with something to read — so a test that wants
 * to exercise it has to say so rather than assume it is always on the table.
 */
export function makeReviewable(state: RunState): RunState {
  const next = withReviewSkill(state);
  plantAiCommit(next);
  return next;
}

/**
 * Writes an unread machine-written commit straight onto the ticket in hand,
 * without a roll. For tests about what happens *to* such a commit.
 */
export function plantAiCommit(state: RunState): string {
  return plantCommit(state, "ai");
}

/** Writes a commit of either hand onto the ticket in hand, without a roll. */
export function plantCommit(state: RunState, mode: CommitMode): string {
  const ticket = ticketInHand(state);
  if (ticket.lane === undefined) throw new Error("ticket has no column");

  const last = ticket.nodeIds[ticket.nodeIds.length - 1];
  const dev = Object.values(state.nodes)
    .filter((node) => node.lane === DEV_LANE)
    .sort((a, b) => b.depth - a.depth)[0];
  const parent = last ?? dev?.id;
  if (parent === undefined) throw new Error("nothing to fork from");

  const id = `${state.sprint}:${state.nextNodeSerial}`;
  state.nextNodeSerial += 1;
  state.nodes[id] = {
    id,
    sprint: state.sprint,
    kind: "commit",
    lane: ticket.lane,
    depth: state.nextDepth,
    parents: [parent],
    ticketId: ticket.id,
    commit: { mode, reviewed: mode === "craft" },
  };
  state.nextDepth += 1;
  ticket.nodeIds.push(id);
  state.player.totalCommits += 1;
  return id;
}

/**
 * A copy whose ticket in hand can be submitted right now and will be
 * accepted: points full, nothing unread, debt under the ceiling.
 */
export function makeReady(state: RunState): RunState {
  const next = structuredClone(state);
  const ticket = ticketInHand(next);
  if (ticket.nodeIds.length === 0) plantCommit(next, "craft");
  ticket.filled = ticket.points;
  next.debt = Math.min(next.debt, BALANCE.acceptance.maxDebt);
  return next;
}

/**
 * Drives a run until the ticket in hand offers `kind`, ready to write it that
 * way. Squash and rebase are situational, so this plays real seeds rather than
 * stubbing the board: a real seed proves the choice is reachable in a game
 * that could actually happen.
 */
export function standingOn(kind: DetourKind, options: { prefix?: string } = {}): RunState {
  return offering(kind, options).state;
}

/**
 * The same, but the craft commit that writes it as `kind` is known to have
 * landed — a roll that missed writes nothing, and a test about what the
 * commit *does* has nothing to assert against.
 */
export function committedAs(
  kind: DetourKind,
  options: { prefix?: string; where?: (state: RunState) => boolean } = {},
): { before: RunState; after: RunState; events: GameEvent[] } {
  const { state } = offering(kind, { ...options, mustResolve: true });
  const result = applyAction(state, { type: "commit", mode: "craft", kind });
  return { before: state, after: result.state, events: result.events };
}

function offering(
  kind: DetourKind,
  options: { prefix?: string; mustResolve?: boolean; where?: (state: RunState) => boolean } = {},
): { state: RunState } {
  const prefix = options.prefix ?? kind;

  for (let attempt = 0; attempt < 400; attempt += 1) {
    let state = newRun(`${prefix}-${attempt}`);

    for (let step = 0; step < 300; step += 1) {
      if (state.phase.kind === "game_over") break;

      const ticket = currentTicket(state);
      if (
        state.phase.kind === "choose_action" &&
        ticket !== null &&
        offersOf(state, ticket).includes(kind) &&
        (options.where?.(state) ?? true)
      ) {
        if (options.mustResolve !== true) return { state };

        // The roll has to have *succeeded*, not merely let the commit through:
        // the failure table can write a commit anyway, and a commit that only
        // survived is not a commit that did what it promised.
        const probe = applyAction(state, { type: "commit", mode: "craft", kind });
        const roll = probe.events.find((event) => event.type === "roll");
        const landed =
          (roll === undefined || (roll.type === "roll" && roll.success)) &&
          probe.events.some((event) => event.type === "node_done" && event.kind === kind);
        if (landed) return { state };
        break;
      }

      // Greedy about the board: every ticket started as soon as it arrives, so
      // one landing while another is open — the situation a rebase needs —
      // happens within a sprint or two rather than never.
      const legal = getAvailableActions(state);
      const action = prefer(
        isType("merge"),
        isType("submit"),
        isType("start"),
        isCommit("ai"),
        isCommit("craft"),
      )(state, legal);
      if (action === undefined) break;

      state = applyAction(state, action).state;
    }
  }

  throw new Error(`No seed out of 400 offered a ${kind} commit`);
}

/**
 * A run stopped on an ordinary commit it has to write: a plain feature ticket
 * in hand, in `choose_action`. Most rules about "a commit" mean this one.
 */
export function writingACommit(prefix: string): RunState {
  return inHand(prefix);
}

/** Takes the first relic on offer, so a test can act after a sprint boundary. */
export function settle(state: RunState): RunState {
  if (state.phase.kind !== "choose_relic") return state;
  const relicId = state.phase.offer[0];
  if (relicId === undefined) return state;
  return applyAction(state, { type: "choose_relic", relicId }).state;
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
  (mode: CommitMode) =>
  (action: PlayerAction): boolean =>
    action.type === "commit" && action.mode === mode && action.kind === undefined;

export const isType =
  (type: PlayerAction["type"]) =>
  (action: PlayerAction): boolean =>
    action.type === type;

/**
 * A player who plays the game: lands a ticket the moment it is ready, writes
 * with the given hand otherwise, and starts whatever is waiting when nothing
 * is in hand. The default for any test that just needs a run to go somewhere.
 */
export function policy(
  mode: CommitMode,
): (state: RunState, actions: PlayerAction[]) => PlayerAction | undefined {
  const other: CommitMode = mode === "ai" ? "craft" : "ai";
  return prefer(
    isType("merge"),
    isType("submit"),
    isCommit(mode),
    isCommit(other),
    isType("start"),
  );
}

/**
 * Submits the ticket in hand and, if the review says yes, presses merge: the
 * two moves a landed ticket takes, with the events of both. A test about
 * what landing does starts here.
 */
export function submitAndMerge(state: RunState): { state: RunState; events: GameEvent[] } {
  const reviewed = applyAction(state, { type: "submit" });
  if (reviewed.state.phase.kind !== "pr_accepted") return reviewed;
  const merged = applyAction(reviewed.state, { type: "merge" });
  return { state: merged.state, events: [...reviewed.events, ...merged.events] };
}

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
      pick: options.pick ?? policy("ai"),
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
