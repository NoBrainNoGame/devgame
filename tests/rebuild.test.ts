import { describe, expect, test } from "bun:test";

import { rebuildRun, snapshotOfSave } from "@/game/bridge/rebuild";
import { toSnapshot } from "@/game/bridge/snapshot";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import type { PlayerAction } from "@/game/core/types";
import type { RunSaveDto } from "@/game/dto/run";
import { SAVE_VERSION } from "@/game/dto/version";

const OPTIONS = {
  seed: "rebuild",
  mode: "classic" as const,
  profileId: "junior" as const,
  version: SAVE_VERSION,
  meta: { unlockedSkills: [], startingSkillPoints: 3 },
};

/** A log played the way a player would: always the first thing on offer. */
function played(count: number): PlayerAction[] {
  let state = createRun(OPTIONS);
  const actions: PlayerAction[] = [];
  while (actions.length < count && state.phase.kind !== "game_over") {
    const action = getAvailableActions(state)[0];
    if (action === undefined) break;
    state = applyAction(state, action).state;
    actions.push(action);
  }
  return actions;
}

describe("rebuilding a run from its log", () => {
  test("the save shows what playing it showed", () => {
    const actions = played(40);
    let state = createRun(OPTIONS);
    for (const action of actions) state = applyAction(state, action).state;

    const save: RunSaveDto = {
      version: SAVE_VERSION,
      rules: "test",
      seed: OPTIONS.seed,
      mode: OPTIONS.mode,
      profileId: OPTIONS.profileId,
      unlockedSkills: [],
      startingSkillPoints: 3,
      actions,
      clientRunId: "5f0c4a52-4b6f-4c9e-9a57-0a1c1a0f4c11",
      createdAt: "2026-09-25T00:00:00.000Z",
    };
    expect(snapshotOfSave(save)).toEqual(toSnapshot(state));
  });

  test("a log the rules no longer accept stops where it breaks", () => {
    const actions = played(10);
    // Merging with nothing to merge is never legal at the start of a run.
    const broken: PlayerAction[] = [...actions.slice(0, 3), { type: "merge" }, ...actions.slice(3)];
    const rebuilt = rebuildRun(OPTIONS, broken);
    expect(rebuilt.replayed).toEqual(actions.slice(0, 3));
  });
});
