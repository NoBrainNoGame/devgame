import { Emitter } from "@/game/bridge/emitter";
import { holdFor, readout } from "@/game/bridge/gauges";
import { toSnapshot } from "@/game/bridge/snapshot";
import { gameStore } from "@/game/bridge/store";
import { isActionAvailable } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun, type ShowcaseOptions } from "@/game/core/run";
import { accountSkillPoints } from "@/game/core/score";
import type { GameEvent, PlayerAction, RunState } from "@/game/core/types";
import type { MetaProgressDto } from "@/game/dto/meta";
import type { RunSaveDto } from "@/game/dto/run";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

/**
 * Owns the live run: the state, the ordered action log that *is* the save, and
 * the store the UI reads.
 *
 * It is an `Emitter` so Booyah chips can `_subscribe` to it and be
 * unsubscribed automatically when they terminate.
 */

export interface AppliedPayload {
  events: GameEvent[];
  state: RunState;
  /** The action that produced them: a purchase is told differently from a turn. */
  action: PlayerAction;
  /** This publication's number, so a late effect can tell it belongs to an older one. */
  batch: number;
  /**
   * Where the action was taken, in page coordinates, when it was taken in a
   * dialog over the canvas: what it gives flies from there to the HUD.
   */
  origin?: { x: number; y: number };
}

/**
 * How the run is being shown right now, which the scene decides and may
 * change at any moment: with no WebGL scene up, nothing animates, so nothing
 * may ever be waited for.
 */
export interface Presentation {
  animated: boolean;
  /**
   * Whether the HUD holds its gauges until the canvas shows how they moved.
   * Only with pops on screen to release them.
   */
  holdGauges: boolean;
}

export interface SessionOptions {
  seed: string;
  mode: "classic" | "daily";
  profileId: MetaProgressDto["unlockedProfiles"][number];
  meta: MetaProgressDto;
  clientRunId: string;
  createdAt: string;
  /** Replays a previously saved log, so a reload resumes where it left off. */
  resumeActions?: readonly PlayerAction[];
  /** The landing page's run: a team from turn 1, and no way to lose. */
  showcase?: ShowcaseOptions;
  /**
   * The skill points the run started with, when they are known rather than
   * derived from the account: a saved run replayed for inspection has to
   * start exactly where it started.
   */
  startingSkillPoints?: number;
}

export type DispatchResult = { ok: true } | { ok: false; reason: string };

export class GameSession extends Emitter {
  private readonly actionLog: PlayerAction[] = [];
  private state: RunState;
  private presentation: Presentation = { animated: true, holdGauges: false };
  private batch = 0;

  constructor(private readonly options: SessionOptions) {
    super();
    this.state = createRun({
      seed: options.seed,
      mode: options.mode,
      profileId: options.profileId,
      version: SAVE_VERSION,
      meta: {
        unlockedSkills: options.meta.unlockedSkills,
        startingSkillPoints: options.startingSkillPoints ?? accountSkillPoints(options.meta.level),
      },
      ...(options.showcase === undefined ? {} : { showcase: options.showcase }),
    });

    for (const action of options.resumeActions ?? []) {
      // A resumed log was legal when it was recorded. If it is not legal now,
      // the rules changed under it — stop and keep what replayed cleanly rather
      // than dropping the player into a state that never existed.
      if (!isActionAvailable(this.state, action)) break;
      this.state = applyAction(this.state, action).state;
      this.actionLog.push(action);
    }

    this.publish();
  }

  getState(): RunState {
    return this.state;
  }

  getActions(): PlayerAction[] {
    return [...this.actionLog];
  }

  /**
   * Applies an action and tells the scene about it.
   *
   * Refused while the canvas is still animating the previous one: letting a
   * second action land mid-sequence would play the two out of order, and the
   * player would see a commit resolve before the node it happened on appeared.
   */
  dispatch(action: PlayerAction, origin?: { x: number; y: number }): DispatchResult {
    if (gameStore.getState().pendingAnimation) {
      return { ok: false, reason: "animating" };
    }
    if (!isActionAvailable(this.state, action)) {
      return { ok: false, reason: "illegal" };
    }

    const result = applyAction(this.state, action);
    this.state = result.state;
    this.actionLog.push(action);

    this.batch += 1;
    this.publish(result.events, action);
    const payload: AppliedPayload = {
      events: result.events,
      state: result.state,
      action,
      batch: this.batch,
      ...(origin === undefined ? {} : { origin }),
    };
    this.emit("applied", payload);

    return { ok: true };
  }

  /** The whole run, small enough to put in `localStorage` or a JSON column. */
  save(): RunSaveDto {
    return {
      version: SAVE_VERSION,
      rules: RULES_FINGERPRINT,
      seed: this.options.seed,
      mode: this.options.mode,
      profileId: this.options.profileId,
      // Read back from the state, not from `options.meta`: a profile merged
      // from another tab mid-run must not change what this run claims.
      unlockedSkills: [...this.state.unlockedSkills],
      startingSkillPoints: this.state.startingSkillPoints,
      actions: this.getActions(),
      clientRunId: this.options.clientRunId,
      createdAt: this.options.createdAt,
    };
  }

  /** Pushes the current state into the store. Public so the mount can republish. */
  publish(events: GameEvent[] = [], action?: PlayerAction): void {
    const isOver = this.state.phase.kind === "game_over";

    const review = events.find((event) => event.type === "pr_reviewed");
    const snapshot = toSnapshot(this.state);
    // The gauges keep their old values until the canvas shows them moving.
    const previous = gameStore.getState().snapshot;
    const heldGauges =
      this.presentation.holdGauges && action !== undefined && previous !== null && events.length > 0
        ? holdFor(readout(previous), readout(snapshot), action, this.batch)
        : null;

    gameStore.setState({
      status: isOver ? "game_over" : "running",
      snapshot,
      heldGauges,
      ...(review === undefined ? {} : { pendingReview: review }),
      // Nothing to watch means nothing to wait for; the scene clears this once
      // it has played whatever it was given. With no scene animating — WebGL
      // lost, or given up for Canvas2D — nothing is ever waited for.
      pendingAnimation: this.presentation.animated && events.length > 0,
      log: [...this.state.log],
      lastEvents: events,
      lastError: null,
    });
  }

  /** Changes how the run is shown, live: the scene may come and go under it. */
  setPresentation(next: Partial<Presentation>): void {
    this.presentation = { ...this.presentation, ...next };
  }

  /**
   * Drops every subscriber. A scene torn down after a throw inside a frame
   * never runs its chips' own teardown, so it cannot be trusted to have
   * unsubscribed itself.
   */
  detachListeners(): void {
    this.clearListeners();
  }

  destroy(): void {
    this.clearListeners();
  }
}
