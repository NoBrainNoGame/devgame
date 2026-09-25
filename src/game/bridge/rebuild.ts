import { type RunSnapshot, toSnapshot } from "@/game/bridge/snapshot";
import { isActionAvailable } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { type CreateRunOptions, createRun } from "@/game/core/run";
import type { PlayerAction, RunState } from "@/game/core/types";
import type { RunSaveDto } from "@/game/dto/run";
import { SAVE_VERSION } from "@/game/dto/version";

/**
 * A run is its seed and its actions: this is where the two become a state
 * again, for the session that resumes a run and for the screen that shows it
 * before it is resumed. One place, so the two never disagree about what a
 * save holds.
 */

export interface Rebuilt {
  state: RunState;
  /** The actions that replayed; shorter than the log if the rules changed under it. */
  replayed: PlayerAction[];
}

export function rebuildRun(options: CreateRunOptions, actions: readonly PlayerAction[]): Rebuilt {
  let state = createRun(options);
  const replayed: PlayerAction[] = [];
  for (const action of actions) {
    // A saved log was legal when it was recorded. If it is not legal now, the
    // rules changed under it — stop and keep what replayed cleanly rather
    // than build a state that never existed.
    if (!isActionAvailable(state, action)) break;
    state = applyAction(state, action).state;
    replayed.push(action);
  }
  return { state, replayed };
}

/**
 * A save as the HUD would read it, without a scene or the store: the account
 * it started under is the one the save declares, never the account as it is
 * now, exactly as when it is resumed.
 */
export function snapshotOfSave(save: RunSaveDto): RunSnapshot {
  const { state } = rebuildRun(
    {
      seed: save.seed,
      mode: save.mode,
      profileId: save.profileId,
      version: SAVE_VERSION,
      meta: { unlockedSkills: save.unlockedSkills, startingSkillPoints: save.startingSkillPoints },
    },
    save.actions,
  );
  return toSnapshot(state);
}
