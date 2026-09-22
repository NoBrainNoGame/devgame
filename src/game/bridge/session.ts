import { Emitter } from "@/game/bridge/emitter";
import { toSnapshot } from "@/game/bridge/snapshot";
import { gameStore } from "@/game/bridge/store";
import { isActionAvailable } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
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
}

export type DispatchResult = { ok: true } | { ok: false; reason: string };

export class GameSession extends Emitter {
  private readonly actionLog: PlayerAction[] = [];
  private state: RunState;

  constructor(private readonly options: SessionOptions) {
    super();
    this.state = createRun({
      seed: options.seed,
      mode: options.mode,
      profileId: options.profileId,
      version: SAVE_VERSION,
      meta: {
        unlockedSkills: options.meta.unlockedSkills,
        startingSkillPoints: accountSkillPoints(options.meta.level),
      },
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
  dispatch(action: PlayerAction): DispatchResult {
    if (gameStore.getState().pendingAnimation) {
      return { ok: false, reason: "animating" };
    }
    if (!isActionAvailable(this.state, action)) {
      return { ok: false, reason: "illegal" };
    }

    const result = applyAction(this.state, action);
    this.state = result.state;
    this.actionLog.push(action);

    this.publish(result.events);
    this.emit("applied", { events: result.events, state: result.state });

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
  publish(events: GameEvent[] = []): void {
    const isOver = this.state.phase.kind === "game_over";

    const review = events.find((event) => event.type === "pr_reviewed");

    gameStore.setState({
      status: isOver ? "game_over" : "running",
      snapshot: toSnapshot(this.state),
      ...(review === undefined ? {} : { pendingReview: review }),
      // Nothing to watch means nothing to wait for; the scene clears this once
      // it has played whatever it was given.
      pendingAnimation: events.length > 0,
      log: [...this.state.log],
      lastEvents: events,
      lastError: null,
    });
  }

  destroy(): void {
    this.clearListeners();
  }
}
