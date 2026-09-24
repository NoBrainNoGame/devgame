import { describe, expect, test } from "bun:test";

import { emptyMeta } from "@/game/dto/meta";
import { isCurrentRules, replayRun } from "@/game/dto/replay";
import { RunSaveSchema } from "@/game/dto/run";
import { overclaims } from "@/lib/run/claims";
import { KNOWN_PATHS } from "@/lib/visits/paths";

import {
  FIXTURE_ACCOUNTS,
  FIXTURE_REPORTS,
  FIXTURE_RUN_PREFIX,
  fixtureUuid,
  isLocalDatabase,
  playFixtureRun,
  VISIT_DAYS,
  visitRows,
} from "../scripts/lib/fixtures";
import { POLICY_NAMES } from "../scripts/lib/policy";

/**
 * `bun run fixtures` fills a local database with runs the server would have
 * accepted. These tests cover the pure half: what it plays replays, what it
 * claims the account holds, and what it writes is well-formed. The database
 * half is exercised by running the script.
 */

const NOW = "2026-09-24T10:00:00.000Z";

describe("fixture catalogue", () => {
  test("accounts are distinct and fit their columns", () => {
    const slugs = new Set(FIXTURE_ACCOUNTS.map((a) => a.slug));
    const names = new Set(FIXTURE_ACCOUNTS.map((a) => a.displayName));
    expect(slugs.size).toBe(FIXTURE_ACCOUNTS.length);
    expect(names.size).toBe(FIXTURE_ACCOUNTS.length);
    for (const account of FIXTURE_ACCOUNTS) {
      expect(account.displayName.length).toBeGreaterThan(0);
      expect(account.displayName.length).toBeLessThanOrEqual(24);
      expect(POLICY_NAMES).toContain(account.policy);
      // Days before the load, oldest first, so the rewards apply in order.
      const days = account.classic.map(([daysAgo]) => daysAgo);
      expect(days).toEqual([...days].sort((a, b) => b - a));
    }
  });

  test("the board has something to hide and something to resume", () => {
    expect(FIXTURE_ACCOUNTS.some((a) => a.banned !== undefined)).toBe(true);
    expect(FIXTURE_ACCOUNTS.some((a) => a.inProgress === "classic")).toBe(true);
    expect(FIXTURE_ACCOUNTS.some((a) => a.inProgress === "daily")).toBe(true);
    expect(FIXTURE_ACCOUNTS.some((a) => a.daily.some(([which]) => which === "today"))).toBe(true);
    expect(FIXTURE_ACCOUNTS.some((a) => a.daily.some(([which]) => which === "yesterday"))).toBe(
      true,
    );
  });

  test("reports belong to fixture accounts and fit the report limits", () => {
    const slugs = new Set(FIXTURE_ACCOUNTS.map((a) => a.slug));
    for (const report of FIXTURE_REPORTS) {
      expect(slugs.has(report.slug)).toBe(true);
      expect(report.title.length).toBeLessThanOrEqual(120);
      expect(report.body.length).toBeLessThanOrEqual(4000);
      if (report.page !== undefined) expect(KNOWN_PATHS).toContain(report.page);
    }
  });
});

describe("fixtureUuid", () => {
  test("is a UUID the save schema accepts, marked and stable", () => {
    const id = fixtureUuid("ada:classic-1");
    expect(RunSaveSchema.shape.clientRunId.safeParse(id).success).toBe(true);
    expect(id.startsWith(FIXTURE_RUN_PREFIX)).toBe(true);
    expect(fixtureUuid("ada:classic-1")).toBe(id);
    expect(fixtureUuid("ada:classic-2")).not.toBe(id);
  });
});

describe("isLocalDatabase", () => {
  test("accepts this machine and refuses everything else", () => {
    expect(isLocalDatabase("postgresql://devgame:devgame@localhost:5443/devgame")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@127.0.0.1/devgame")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@db.example.com:5432/devgame")).toBe(false);
    expect(isLocalDatabase("postgresql://u:p@10.0.0.4/devgame")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
  });
});

describe("playFixtureRun", () => {
  test("plays a run the server would accept, and claims no more than the account has", () => {
    const meta = emptyMeta(NOW);
    const played = playFixtureRun({
      seed: "fixture-test-1",
      mode: "classic",
      profileId: "junior",
      policy: "mixed",
      meta,
      clientRunId: fixtureUuid("test:1"),
      createdAt: NOW,
      quitAtSprint: 5,
    });

    expect(RunSaveSchema.safeParse(played.save).success).toBe(true);
    expect(isCurrentRules(played.save)).toBe(true);
    expect(overclaims(played.save, meta)).toBeNull();

    const replay = replayRun(played.save);
    expect(replay.valid).toBe(true);
    if (!replay.valid) return;
    expect(replay.finished).toBe(true);
    expect(replay.stats.turns).toBe(played.state.turn);
  });

  test("stops at a sprint when asked, leaving a run still going", () => {
    const played = playFixtureRun({
      seed: "fixture-test-2",
      mode: "classic",
      profileId: "junior",
      policy: "careful",
      meta: emptyMeta(NOW),
      clientRunId: fixtureUuid("test:2"),
      createdAt: NOW,
      stopAtSprint: 3,
    });
    expect(played.state.sprint).toBe(3);
    const replay = replayRun(played.save);
    expect(replay.valid && !replay.finished).toBe(true);
  });
});

describe("visitRows", () => {
  test("covers every day, page and language, and never counts more visits than views", () => {
    const rows = visitRows(new Date(NOW));
    expect(rows.length).toBe(VISIT_DAYS * KNOWN_PATHS.length * 2);
    for (const row of rows) {
      expect(row.visits).toBeLessThanOrEqual(row.views);
      expect(row.views).toBeGreaterThanOrEqual(0);
    }
    expect(visitRows(new Date(NOW))).toEqual(rows);
  });
});
