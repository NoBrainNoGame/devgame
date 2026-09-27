import { describe, expect, test } from "bun:test";

import fc from "fast-check";

import { emptyMeta, MetaProgressSchema } from "@/game";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_ROUTE,
  ACHIEVEMENTS,
  type AchievementId,
  nextOnRoute,
} from "@/game/content";
import { achievementsInRun, achievementsOfAccount } from "@/game/core/achievements";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import type { PlayerAction, RunState } from "@/game/core/types";
import { mergeMeta } from "@/lib/profile/merge";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { funded, hiringPolicy, inHand, newRun, policy } from "./helpers";

const NOW = "2026-09-27T10:00:00.000Z";

/** Plays with `pick` and collects everything the run qualified for on the way. */
function collect(
  start: RunState,
  pick: (state: RunState, actions: PlayerAction[]) => PlayerAction | undefined,
  limit: number,
): Set<AchievementId> {
  const earned = new Set<AchievementId>();
  let state = start;
  for (let i = 0; i < limit && state.phase.kind !== "game_over"; i += 1) {
    const action = pick(state, getAvailableActions(state));
    if (action === undefined) break;
    const result = applyAction(state, action);
    state = result.state;
    for (const id of achievementsInRun({ state, events: result.events, action })) earned.add(id);
  }
  return earned;
}

describe("the table", () => {
  test("the route is the route group, in the order of the ids", () => {
    expect(ACHIEVEMENT_ROUTE.length).toBeGreaterThan(5);
    expect(ACHIEVEMENT_ROUTE.every((id) => ACHIEVEMENTS[id].group === "route")).toBe(true);
    expect(nextOnRoute(new Set())).toBe(ACHIEVEMENT_ROUTE[0] ?? null);
    expect(nextOnRoute(new Set(ACHIEVEMENT_ROUTE))).toBeNull();
    // Earned out of order, the road still points at the first step missing.
    expect(nextOnRoute(new Set([ACHIEVEMENT_ROUTE[1] ?? ""]))).toBe(ACHIEVEMENT_ROUTE[0] ?? null);
  });

  test("every achievement has a name and a description in both languages", () => {
    for (const catalogue of [fr, en]) {
      const items = catalogue.achievements.items as Record<string, { name: string; desc: string }>;
      for (const id of ACHIEVEMENT_IDS) {
        expect(items[id]?.name.length ?? 0).toBeGreaterThan(0);
        expect(items[id]?.desc.length ?? 0).toBeGreaterThan(0);
      }
      expect(Object.keys(items).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    }
  });
});

describe("earning them", () => {
  test("a run played by hand walks the first steps of the route", () => {
    const earned = collect(newRun("route-walk"), policy("craft"), 400);
    for (const id of [
      "first_ticket",
      "first_commit",
      "first_pr",
      "first_delivery",
      "first_payday",
      "first_sprint",
    ] as const) {
      expect(earned.has(id)).toBe(true);
    }
  });

  test("the machine's commit, and a hire, are steps of their own", () => {
    expect(collect(newRun("route-ai"), policy("ai"), 30).has("first_ai_commit")).toBe(true);
    expect(collect(funded("route-hire", 5_000), hiringPolicy("craft"), 60).has("first_hire")).toBe(
      true,
    );
  });

  test("an action is only credited with what it did", () => {
    const state = inHand("credit");
    const action = getAvailableActions(state).find((a) => a.type === "commit");
    if (action === undefined) throw new Error("A ticket in hand offers a commit");
    const result = applyAction(state, action);
    const earned = achievementsInRun({ state: result.state, events: result.events, action });
    expect(earned).toContain("first_commit");
    expect(earned).not.toContain("first_hire");
    expect(earned).not.toContain("first_delivery");
  });

  test("watching changes nothing in the run", () => {
    const state = inHand("pure");
    const action = getAvailableActions(state)[0];
    if (action === undefined) throw new Error("A run in progress offers something");
    const result = applyAction(state, action);
    const before = JSON.stringify(result.state);
    achievementsInRun({ state: result.state, events: result.events, action });
    expect(JSON.stringify(result.state)).toBe(before);
  });

  test("a showcase earns nothing: the landing page's run is not the visitor's", () => {
    const state = inHand("showcase");
    state.showcase = { backlog: 3 };
    const action = getAvailableActions(state).find((a) => a.type === "commit");
    if (action === undefined) throw new Error("A ticket in hand offers a commit");
    const result = applyAction(state, action);
    expect(achievementsInRun({ state: result.state, events: result.events, action })).toEqual([]);
  });

  test("the account's achievements come from its totals", () => {
    expect(achievementsOfAccount({ level: 1, ticketsDelivered: 0 })).toEqual([]);
    expect(achievementsOfAccount({ level: 10, ticketsDelivered: 999 })).toEqual([
      "account_level_10",
    ]);
    expect(achievementsOfAccount({ level: 12, ticketsDelivered: 1000 })).toEqual([
      "account_level_10",
      "account_tickets_1000",
    ]);
  });
});

describe("keeping them", () => {
  test("a profile from before achievements parses with none", () => {
    const { achievements: _, ...old } = emptyMeta(NOW);
    const parsed = MetaProgressSchema.parse(old);
    expect(parsed.achievements).toEqual([]);
  });

  test("an id this build does not know is dropped, not the whole profile", () => {
    const parsed = MetaProgressSchema.parse({
      ...emptyMeta(NOW),
      achievements: [
        { id: "first_commit", at: NOW },
        { id: "retired_long_ago", at: NOW },
        { id: "first_commit", at: "2026-09-28T10:00:00.000Z" },
      ],
    });
    expect(parsed.achievements).toEqual([{ id: "first_commit", at: NOW }]);
  });

  const arbitraryRecords = fc
    .subarray([...ACHIEVEMENT_IDS])
    .chain((ids) =>
      fc.tuple(
        ...ids.map((id) =>
          fc
            .integer({ min: 0, max: 10_000_000 })
            .map((offset) => ({ id, at: new Date(Date.parse(NOW) + offset).toISOString() })),
        ),
      ),
    );

  test("merging keeps every achievement either copy holds, dated the first time", () => {
    fc.assert(
      fc.property(arbitraryRecords, arbitraryRecords, (a, b) => {
        const merged = mergeMeta(
          { ...emptyMeta(NOW), achievements: a },
          { ...emptyMeta(NOW), achievements: b },
        ).achievements;
        const ids = new Set([...a, ...b].map((record) => record.id));
        expect(merged.map((record) => record.id).sort()).toEqual([...ids].sort());
        for (const record of merged) {
          const dates = [...a, ...b]
            .filter((other) => other.id === record.id)
            .map((other) => Date.parse(other.at));
          expect(Date.parse(record.at)).toBe(Math.min(...dates));
        }
        const swapped = mergeMeta(
          { ...emptyMeta(NOW), achievements: b },
          { ...emptyMeta(NOW), achievements: a },
        ).achievements;
        expect(swapped).toEqual(merged);
      }),
    );
  });
});
