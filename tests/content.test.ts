import { describe, expect, test } from "bun:test";

import {
  AMBIENT_EVENT_IDS,
  AMBIENT_EVENTS,
  DEV_RANK,
  EFFECT_KEYS,
  FAILURE_EVENT_IDS,
  FAILURE_EVENTS,
  MERGE_EVENT_IDS,
  MERGE_EVENTS,
  NO_EFFECTS,
  PROFILE_IDS,
  PROFILES,
  RELIC_IDS,
  RELICS,
  SKILL_IDS,
  SKILLS,
  TREE,
  TREE_BRANCHES,
  TREE_IDS,
  treeCost,
  UPGRADE_CATEGORIES,
  UPGRADE_IDS,
  UPGRADES,
  upgradeCost,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fingerprintFor, RULES_EPOCH, RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

/**
 * Content is data, and data drifts. These are the checks that catch a typo in
 * a table before it becomes a run that cannot be replayed.
 */
describe("content tables", () => {
  test("every id list is unique", () => {
    for (const ids of [
      SKILL_IDS,
      RELIC_IDS,
      TREE_IDS,
      UPGRADE_IDS,
      PROFILE_IDS,
      FAILURE_EVENT_IDS,
      MERGE_EVENT_IDS,
      AMBIENT_EVENT_IDS,
    ]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("every entry's id matches its key", () => {
    for (const id of SKILL_IDS) expect(SKILLS[id].id).toBe(id);
    for (const id of RELIC_IDS) expect(RELICS[id].id).toBe(id);
    for (const id of TREE_IDS) expect(TREE[id].id).toBe(id);
    for (const id of UPGRADE_IDS) expect(UPGRADES[id].id).toBe(id);
    for (const id of PROFILE_IDS) expect(PROFILES[id].id).toBe(id);
    for (const id of FAILURE_EVENT_IDS) expect(FAILURE_EVENTS[id].id).toBe(id);
    for (const id of MERGE_EVENT_IDS) expect(MERGE_EVENTS[id].id).toBe(id);
    for (const id of AMBIENT_EVENT_IDS) expect(AMBIENT_EVENTS[id].id).toBe(id);
  });

  test("no content mentions an effect that does not exist", () => {
    const known = new Set<string>(EFFECT_KEYS);
    const sources = [
      ...SKILL_IDS.map((id) => SKILLS[id].effects),
      ...RELIC_IDS.map((id) => RELICS[id].effects),
      ...TREE_IDS.map((id) => TREE[id].perLevel),
      ...UPGRADE_IDS.map((id) => UPGRADES[id].perLevel),
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
      ...TREE_IDS.map((id) => TREE[id].perLevel),
      ...UPGRADE_IDS.map((id) => UPGRADES[id].perLevel),
      ...PROFILE_IDS.map((id) => PROFILES[id].effects),
    ];

    for (const effects of sources) {
      for (const [key, value] of Object.entries(effects)) {
        const expected = typeof NO_EFFECTS[key as keyof typeof NO_EFFECTS];
        expect(typeof value).toBe(expected);
      }
    }
  });

  test("every tree node has a price for each of its levels", () => {
    for (const id of TREE_IDS) {
      const def = TREE[id];
      expect(def.cost.length).toBe(def.maxLevel);
      for (let level = 0; level < def.maxLevel; level++) {
        expect(treeCost(id, level)).toBeGreaterThan(0);
      }
      expect(treeCost(id, def.maxLevel)).toBeUndefined();
    }
  });

  test("every tree node sits on a branch and its prerequisites are reachable", () => {
    for (const id of TREE_IDS) {
      const def = TREE[id];
      expect(TREE_BRANCHES).toContain(def.branch);
      for (const req of def.requires ?? []) {
        expect(req.id).not.toBe(id);
        expect(TREE_IDS).toContain(req.id);
        expect(req.level).toBeGreaterThan(0);
        expect(req.level).toBeLessThanOrEqual(TREE[req.id].maxLevel);
        // A prerequisite is drawn above the node it gates, so it has to live
        // on the same branch or the tree screen cannot show the line.
        expect(TREE[req.id].branch).toBe(def.branch);
      }
    }
  });

  test("every upgrade has a geometric price, a category and a tier", () => {
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      expect(UPGRADE_CATEGORIES).toContain(def.category);
      expect(def.tier).toBeGreaterThanOrEqual(0);
      expect(def.upkeep).toBeGreaterThanOrEqual(0);
      expect(def.price.base).toBeGreaterThan(0);
      expect(def.price.growth).toBeGreaterThanOrEqual(1);
      const last = def.maxLevel ?? 5;
      let previous = 0;
      for (let level = 0; level < last; level++) {
        const cost = upgradeCost(id, level);
        expect(cost).toBeGreaterThan(0);
        expect(cost).toBeGreaterThanOrEqual(previous);
        previous = cost ?? 0;
      }
      if (def.maxLevel !== undefined) expect(upgradeCost(id, def.maxLevel)).toBeUndefined();
      else expect(upgradeCost(id, 50)).toBeGreaterThan(0);
      if (def.maxLevel === undefined && id !== "death_star") {
        expect(def.price.growth).toBeGreaterThan(1);
      }
    }
  });

  test("the ladders climb: each rung is a tier above the last and ten times as big", () => {
    const rungs = [
      "servers",
      "datacenter",
      "region",
      "orbital_station",
      "dyson_swarm",
      "death_star",
    ] as const;
    for (let i = 1; i < rungs.length; i++) {
      const lower = UPGRADES[rungs[i - 1] as (typeof rungs)[number]];
      const upper = UPGRADES[rungs[i] as (typeof rungs)[number]];
      expect(upper.tier).toBe(lower.tier + 1);
      expect(upper.perLevel.infraCapacity).toBe((lower.perLevel.infraCapacity ?? 0) * 10);
      expect(upper.price.base).toBe(lower.price.base * 10);
    }
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      if (def.hires !== undefined) {
        expect(def.category).toBe("org");
        expect(def.perLevel.teamSeats ?? 0).toBeGreaterThanOrEqual(def.hires.count);
        expect(DEV_RANK[def.hires.rank].tier).toBeLessThanOrEqual(def.tier);
      }
    }
  });

  test("the tree has no cycle", () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: (typeof TREE_IDS)[number]): void => {
      if (done.has(id)) return;
      expect(visiting.has(id)).toBe(false);
      visiting.add(id);
      for (const req of TREE[id].requires ?? []) visit(req.id);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of TREE_IDS) visit(id);
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
   * This test failing is not a bug. It means the rules changed, which makes
   * every recorded run incomparable with the new ones — the leaderboard checks
   * `RULES_FINGERPRINT` and will correctly turn the old ones away.
   *
   * If a *number* or an id changed, update the expected value below and stop
   * there. If the rules *code* changed in a way that alters what an old action
   * log replays to, bump `RULES_EPOCH` as well: the hash cannot see that on its
   * own.
   */
  test("has not changed without anyone noticing", () => {
    expect(RULES_FINGERPRINT).toBe("f0f7627a");
  });

  test("the save version and the epoch are positive integers", () => {
    expect(Number.isInteger(SAVE_VERSION)).toBe(true);
    expect(SAVE_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(RULES_EPOCH)).toBe(true);
    expect(RULES_EPOCH).toBeGreaterThan(0);
  });

  test("the epoch feeds the fingerprint, so bumping it is enough", () => {
    // Guards the mechanism itself. Computing the real fingerprint for a
    // neighbouring epoch is the only comparison that proves the epoch is part
    // of the hash: anything built from a different shape would differ whether
    // or not the epoch were included.
    expect(fingerprintFor(RULES_EPOCH)).toBe(RULES_FINGERPRINT);
    expect(fingerprintFor(RULES_EPOCH + 1)).not.toBe(RULES_FINGERPRINT);
    expect(fingerprintFor(RULES_EPOCH - 1)).not.toBe(RULES_FINGERPRINT);
  });
});
