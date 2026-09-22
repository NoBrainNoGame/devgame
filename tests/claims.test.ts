import { describe, expect, test } from "bun:test";

import {
  accountSkillPoints,
  emptyMeta,
  type MetaProgressDto,
  RULES_FINGERPRINT,
  type RunSaveDto,
  SAVE_VERSION,
} from "@/game";
import { overclaims } from "@/lib/run/claims";

const NOW = "2026-09-21T10:00:00.000Z";

function save(overrides: Partial<RunSaveDto> = {}): RunSaveDto {
  return {
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed: "abcd",
    mode: "classic",
    profileId: "junior",
    unlockedSkills: ["linter"],
    startingSkillPoints: 0,
    actions: [],
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: NOW,
    ...overrides,
  };
}

function meta(overrides: Partial<MetaProgressDto> = {}): MetaProgressDto {
  return { ...emptyMeta(NOW), ...overrides };
}

/**
 * The replay is only as trustworthy as what it starts from. These are the
 * fields a client states about itself, and every one of them changes the game
 * the replay produces.
 */
describe("overclaims", () => {
  test("accepts a save that matches the account", () => {
    expect(overclaims(save(), meta())).toBeNull();
  });

  test("accepts a save claiming less than the account has", () => {
    const account = meta({
      unlockedSkills: ["linter", "coffee", "ci_cd"],
      level: 6,
    });
    expect(overclaims(save(), account)).toBeNull();
  });

  test("refuses starting skill points the account's level never granted", () => {
    const forged = save({ startingSkillPoints: 999 });
    expect(overclaims(forged, meta())).toContain("skill points");
  });

  test("refuses a single point too many", () => {
    const account = meta({ level: 4 });
    const held = accountSkillPoints(4);
    expect(overclaims(save({ startingSkillPoints: held + 1 }), account)).not.toBeNull();
    expect(overclaims(save({ startingSkillPoints: held }), account)).toBeNull();
  });

  test("refuses skills the account has not unlocked, and names them", () => {
    const forged = save({ unlockedSkills: ["linter", "rubber_duck", "feature_flags"] });
    const reason = overclaims(forged, meta());

    expect(reason).toContain("feature_flags");
    expect(reason).toContain("rubber_duck");
  });

  test("refuses a starter the account has not unlocked", () => {
    expect(overclaims(save({ profileId: "vibe_coder" }), meta())).toContain("vibe_coder");
  });
});
