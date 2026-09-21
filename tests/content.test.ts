import { describe, expect, test } from "bun:test";

import {
  AMBIENT_EVENT_IDS,
  AMBIENT_EVENTS,
  BOT_ARCHETYPE_IDS,
  BOT_ARCHETYPES,
  BOT_SKILL_IDS,
  DEVOPS,
  DEVOPS_IDS,
  devopsCost,
  EFFECT_KEYS,
  FAILURE_EVENT_IDS,
  FAILURE_EVENTS,
  FEATURE_SKILL_IDS,
  NO_EFFECTS,
  PROFILE_IDS,
  PROFILES,
  RELIC_IDS,
  RELICS,
  SKILL_IDS,
  SKILLS,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

/**
 * Content is data, and data drifts. These are the checks that catch a typo in
 * a table before it becomes a run that cannot be replayed.
 */
describe("content tables", () => {
  test("every id list is unique", () => {
    for (const ids of [
      SKILL_IDS,
      RELIC_IDS,
      DEVOPS_IDS,
      PROFILE_IDS,
      BOT_ARCHETYPE_IDS,
      FAILURE_EVENT_IDS,
      AMBIENT_EVENT_IDS,
    ]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("every entry's id matches its key", () => {
    for (const id of SKILL_IDS) expect(SKILLS[id].id).toBe(id);
    for (const id of RELIC_IDS) expect(RELICS[id].id).toBe(id);
    for (const id of DEVOPS_IDS) expect(DEVOPS[id].id).toBe(id);
    for (const id of PROFILE_IDS) expect(PROFILES[id].id).toBe(id);
    for (const id of BOT_ARCHETYPE_IDS) expect(BOT_ARCHETYPES[id].id).toBe(id);
    for (const id of FAILURE_EVENT_IDS) expect(FAILURE_EVENTS[id].id).toBe(id);
    for (const id of AMBIENT_EVENT_IDS) expect(AMBIENT_EVENTS[id].id).toBe(id);
  });

  test("no content mentions an effect that does not exist", () => {
    const known = new Set<string>(EFFECT_KEYS);
    const sources = [
      ...SKILL_IDS.map((id) => SKILLS[id].effects),
      ...RELIC_IDS.map((id) => RELICS[id].effects),
      ...DEVOPS_IDS.map((id) => DEVOPS[id].perLevel),
      ...PROFILE_IDS.map((id) => PROFILES[id].effects),
    ];

    for (const effects of sources) {
      for (const key of Object.keys(effects)) expect(known).toContain(key);
    }
  });

  test("effect values have the type the field declares", () => {
    const sources = [
      ...SKILL_IDS.map((id) => SKILLS[id].effects),
      ...RELIC_IDS.map((id) => RELICS[id].effects),
      ...DEVOPS_IDS.map((id) => DEVOPS[id].perLevel),
      ...PROFILE_IDS.map((id) => PROFILES[id].effects),
    ];

    for (const effects of sources) {
      for (const [key, value] of Object.entries(effects)) {
        const expected = typeof NO_EFFECTS[key as keyof typeof NO_EFFECTS];
        expect(typeof value).toBe(expected);
      }
    }
  });

  test("each archetype hands over a distinct trophy, and only bot skills", () => {
    const trophies = BOT_ARCHETYPE_IDS.map((id) => BOT_ARCHETYPES[id].trophy);
    expect(new Set(trophies).size).toBe(trophies.length);
    for (const trophy of trophies) expect(BOT_SKILL_IDS).toContain(trophy);
  });

  test("feature skills and bot skills do not overlap", () => {
    for (const id of FEATURE_SKILL_IDS) expect(SKILLS[id].source).toBe("feature");
    for (const id of BOT_SKILL_IDS) expect(SKILLS[id].source).toBe("bot");
    expect(FEATURE_SKILL_IDS.length + BOT_SKILL_IDS.length).toBe(SKILL_IDS.length);
  });

  test("every DevOps node has a price for each of its levels", () => {
    for (const id of DEVOPS_IDS) {
      const def = DEVOPS[id];
      expect(def.cost.length).toBe(def.maxLevel);
      for (let level = 0; level < def.maxLevel; level++) {
        expect(devopsCost(id, level)).toBeGreaterThan(0);
      }
      expect(devopsCost(id, def.maxLevel)).toBeUndefined();
    }
  });

  test("the starter profile is free and the rest are earned", () => {
    expect(PROFILES.junior.unlockCost).toBe(0);
    for (const id of PROFILE_IDS) {
      if (id === "junior") continue;
      expect(PROFILES[id].unlockCost).toBeGreaterThan(0);
    }
  });

  test("every node kind has an energy price", () => {
    const kinds = Object.keys(BALANCE.energy.cost);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(typeof BALANCE.energy.cost[kind as keyof typeof BALANCE.energy.cost]).toBe("number");
    }
  });
});

describe("rules fingerprint", () => {
  /**
   * This test failing is not a bug. It means the balance table or the content
   * ids changed, which makes every recorded run incomparable with the new ones.
   * Update the expected value here and bump nothing else — `RULES_FINGERPRINT`
   * is what the leaderboard checks, and old runs correctly stop matching.
   */
  test("has not changed without anyone noticing", () => {
    expect(RULES_FINGERPRINT).toBe("2b94c524");
  });

  test("the save version is a positive integer", () => {
    expect(Number.isInteger(SAVE_VERSION)).toBe(true);
    expect(SAVE_VERSION).toBeGreaterThan(0);
  });
});
