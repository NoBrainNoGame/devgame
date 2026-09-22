import { describe, expect, test } from "bun:test";

import { RULES_FINGERPRINT, replayRun, runFingerprint, SAVE_VERSION } from "@/game";
import type { SkillId } from "@/game/content";
import { createRun } from "@/game/core/run";
import type { StatPoints } from "@/game/core/types";

import { newRun, play, policy } from "./helpers";

/**
 * A run played *under* the given conditions, the way an attacker would build
 * one: the action log is recorded against the same claim it is submitted with,
 * so the replay is internally consistent and passes.
 */
function forgedSave(seed: string, statPoints: StatPoints) {
  const start = createRun({
    seed,
    mode: "classic",
    profileId: "junior",
    version: SAVE_VERSION,
    meta: { statPoints },
  });
  const live = play(start, { pick: policy("ai"), limit: 400 });

  return {
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed,
    mode: "classic" as const,
    profileId: "junior" as const,
    unlockedSkills: live.state.unlockedSkills,
    statPoints,
    actions: live.actions,
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-21T10:00:00.000Z",
  };
}

/** The same shape, varying the unlocks the account claims instead. */
function unlockSave(seed: string, unlockedSkills: SkillId[]) {
  const start = createRun({
    seed,
    mode: "classic",
    profileId: "junior",
    version: SAVE_VERSION,
    meta: { unlockedSkills },
  });
  const live = play(start, { pick: policy("ai"), limit: 400 });

  return {
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed,
    mode: "classic" as const,
    profileId: "junior" as const,
    unlockedSkills,
    statPoints: { energyMax: 0, luck: 0, conflictRes: 0 },
    actions: live.actions,
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-21T10:00:00.000Z",
  };
}

function saveFor(seed: string, overrides: Record<string, unknown> = {}) {
  const live = play(newRun(seed), { pick: policy("ai"), limit: 200 });
  return {
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed,
    mode: "classic" as const,
    profileId: "junior" as const,
    unlockedSkills: live.state.unlockedSkills,
    statPoints: live.state.statPoints,
    actions: live.actions,
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * The claimed starting conditions are not decoration: they change the map and
 * every roll. This is the evidence that they do, and therefore the reason
 * `overclaims` has to check them before a replay is believed.
 */
describe("forged starting conditions", () => {
  test("a run played under forged stats replays cleanly and scores far higher", () => {
    const honest = replayRun(forgedSave("cheat", { energyMax: 0, luck: 0, conflictRes: 0 }));
    const forged = replayRun(forgedSave("cheat", { energyMax: 999, luck: 999, conflictRes: 999 }));

    // Both are internally consistent: the replay cannot tell them apart, which
    // is the whole reason `overclaims` has to check the claim against the
    // account before `submitRun` believes a score.
    expect(honest.valid).toBe(true);
    expect(forged.valid).toBe(true);
    if (!honest.valid || !forged.valid) return;

    // They score differently, and the replay has no way to say which set of
    // stats it was entitled to. A different score from the same action log is
    // exactly the hole `overclaims` exists to close.
    expect(forged.score).not.toBe(honest.score);
  });

  test("the claimed unlocks decide which skills the map offers", () => {
    const narrow = replayRun(unlockSave("pool", ["linter"]));
    const wide = replayRun(unlockSave("pool", ["ci_cd", "coffee", "linter", "unit_tests"]));

    expect(narrow.valid).toBe(true);
    expect(wide.valid).toBe(true);
    if (!narrow.valid || !wide.valid) return;

    // Same seed, same policy, different claim — a different game. That is why
    // the claim is checked against the account rather than believed.
    expect(wide.stats.hash).not.toBe(narrow.stats.hash);
  });
});

describe("runFingerprint", () => {
  test("is the same for the same game sent twice", () => {
    const first = saveFor("dupe");
    const second = { ...first, clientRunId: "99999999-8888-4777-8666-555555555555" };

    expect(runFingerprint(second)).toBe(runFingerprint(first));
  });

  test("ignores the fields that do not describe the game", () => {
    const base = saveFor("dupe-2");
    const relabelled = {
      ...base,
      createdAt: "2030-01-01T00:00:00.000Z",
      clientRunId: "77777777-6666-4555-8444-333333333333",
    };

    expect(runFingerprint(relabelled)).toBe(runFingerprint(base));
  });

  test("differs when the seed, the starter or a single action differs", () => {
    const base = saveFor("dupe-3");

    expect(runFingerprint({ ...base, seed: "other" })).not.toBe(runFingerprint(base));
    expect(runFingerprint({ ...base, profileId: "senior" })).not.toBe(runFingerprint(base));
    expect(runFingerprint({ ...base, actions: [...base.actions, { type: "review" }] })).not.toBe(
      runFingerprint(base),
    );
  });

  test("is sixteen hex characters, which is wide enough to tell runs apart", () => {
    expect(runFingerprint(saveFor("dupe-4"))).toMatch(/^[0-9a-f]{16}$/);
  });
});
