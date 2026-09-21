import { describe, expect, test } from "bun:test";

import {
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
    statPoints: { energyMax: 0, luck: 0, conflictRes: 0 },
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
      statPoints: { energyMax: 5, luck: 2, conflictRes: 1 },
    });
    expect(overclaims(save(), account)).toBeNull();
  });

  test("refuses stat points the account never earned", () => {
    const forged = save({ statPoints: { energyMax: 999, luck: 999, conflictRes: 999 } });
    expect(overclaims(forged, meta())).toContain("energyMax");
  });

  test("refuses a single point too many", () => {
    const account = meta({ statPoints: { energyMax: 3, luck: 0, conflictRes: 0 } });
    expect(
      overclaims(save({ statPoints: { energyMax: 4, luck: 0, conflictRes: 0 } }), account),
    ).not.toBeNull();
    expect(
      overclaims(save({ statPoints: { energyMax: 3, luck: 0, conflictRes: 0 } }), account),
    ).toBeNull();
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
