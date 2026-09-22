import { describe, expect, test } from "bun:test";

import { applyAction } from "@/game/core/rules/reducer";
import { hashState } from "@/game/core/run";
import { replayRun } from "@/game/dto/replay";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

import { isCommit, isType, newRun, play, prefer } from "./helpers";

/**
 * The property the whole anti-cheat rests on: a seed and a list of actions
 * describe exactly one game. If any of these fail, a submitted score can no
 * longer be verified and the leaderboard is fiction.
 */
describe("determinism", () => {
  const policy = prefer(isType("merge"), isCommit("ai"), isCommit("craft"), isType("start"));

  test("the same seed and actions produce the same state", () => {
    for (const seed of ["alpha", "beta", "gamma", "delta"]) {
      const first = play(newRun(seed), { pick: policy, limit: 150 });
      const second = play(newRun(seed), { pick: policy, limit: 150 });

      expect(hashState(second.state)).toBe(hashState(first.state));
      expect(second.actions).toEqual(first.actions);
    }
  });

  test("different seeds produce different games", () => {
    const a = play(newRun("alpha"), { pick: policy, limit: 60 });
    const b = play(newRun("omega"), { pick: policy, limit: 60 });
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });

  test("applyAction never mutates the state it was given", () => {
    const before = newRun("immutable");
    const snapshot = JSON.stringify(before);

    const actions = play(before, { pick: policy, limit: 40 }).actions;
    let state = before;
    for (const action of actions) state = applyAction(state, action).state;

    expect(JSON.stringify(before)).toBe(snapshot);
    expect(state).not.toBe(before);
  });

  test("a replayed action log lands on the identical state", () => {
    for (const seed of ["replay-1", "replay-2", "replay-3"]) {
      const live = play(newRun(seed), { pick: policy, limit: 200 });

      const result = replayRun({
        version: SAVE_VERSION,
        rules: RULES_FINGERPRINT,
        seed,
        mode: "classic",
        profileId: "junior",
        unlockedSkills: live.state.unlockedSkills,
        statPoints: live.state.statPoints,
        actions: live.actions,
        clientRunId: "11111111-2222-4333-8444-555555555555",
        createdAt: "2026-09-21T00:00:00.000Z",
      });

      expect(result.valid).toBe(true);
      if (!result.valid) continue;
      expect(result.stats.hash).toBe(hashState(live.state));
    }
  });

  test("the log is excluded from the hash, so a translation cannot change it", () => {
    const { state } = play(newRun("log-free"), { pick: policy, limit: 30 });
    const tampered = structuredClone(state);
    tampered.log = [];

    expect(hashState(tampered)).toBe(hashState(state));
    expect(state.log.length).toBeGreaterThan(0);
  });

  test("a tampered action log is rejected rather than scored", () => {
    const live = play(newRun("tamper"), { pick: policy, limit: 80 });
    const actions = [...live.actions];
    // Starting a ticket that does not exist at that point in the run.
    actions.splice(3, 0, { type: "start", ticketId: "t999" });

    const result = replayRun({
      version: SAVE_VERSION,
      rules: RULES_FINGERPRINT,
      seed: "tamper",
      mode: "classic",
      profileId: "junior",
      unlockedSkills: live.state.unlockedSkills,
      statPoints: live.state.statPoints,
      actions,
      clientRunId: "11111111-2222-4333-8444-555555555555",
      createdAt: "2026-09-21T00:00:00.000Z",
    });

    expect(result.valid).toBe(false);
  });
});
