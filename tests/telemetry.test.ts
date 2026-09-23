import { describe, expect, test } from "bun:test";

import { type RunSaveDto, replayRun, summariseRun } from "@/game";
import type { RunSummary } from "@/game/core/summary";
import type { PlayerAction, RunState } from "@/game/core/types";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";
import {
  digestSamples,
  latestPerRun,
  quantiles,
  renderDigestMarkdown,
  type SampleRow,
} from "@/lib/telemetry/digest";
import { RunSampleInputSchema } from "@/lib/telemetry/schema";

import { funded, hiringPolicy, newRun, play, policy } from "./helpers";

function toSave(state: RunState, actions: PlayerAction[]): RunSaveDto {
  return {
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed: state.seed,
    mode: state.mode,
    profileId: state.profileId,
    unlockedSkills: state.unlockedSkills,
    startingSkillPoints: state.startingSkillPoints,
    actions,
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-23T10:00:00.000Z",
  };
}

/**
 * Telemetry: the counters the engine keeps for the balancing table, the
 * summary they flatten into, and the digest that aggregates many of them.
 * The rows here are built by playing, never typed by hand, so a counter
 * that stops being incremented shows up.
 */

describe("run stats", () => {
  test("count what the player did", () => {
    const { state } = play(newRun("stats-1"), { pick: policy("craft"), limit: 120 });
    const stats = state.stats;
    expect(stats.commitsTried.craft + stats.commitsTried.ai).toBeGreaterThan(0);
    expect(stats.commitsLanded.craft).toBeLessThanOrEqual(stats.commitsTried.craft);
    expect(stats.commitsLanded.ai).toBeLessThanOrEqual(stats.commitsTried.ai);
    const arrived = Object.values(stats.arrivedByKind).reduce((a, b) => a + b, 0);
    expect(arrived).toBe(Object.keys(state.tickets).length);
    const delivered = Object.values(stats.deliveredByPlayer).reduce((a, b) => a + b, 0);
    expect(delivered + stats.deliveredByTeam).toBe(state.ticketsDelivered);
    expect(stats.moneyPeak).toBeGreaterThanOrEqual(state.money);
  });

  test("record hires, tiers and the peak", () => {
    const { state } = play(funded("stats-2", 5000), { pick: hiringPolicy("craft"), limit: 60 });
    expect(state.stats.hires).toBe(state.devs.length);
    expect(state.stats.moneyPeak).toBeGreaterThanOrEqual(state.money);
    for (const [tier, sprint] of Object.entries(state.stats.tierSprint)) {
      expect(Number(tier)).toBeLessThanOrEqual(state.tier);
      expect(sprint).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("summariseRun", () => {
  test("reads a replayed state, never the client", () => {
    const played = play(newRun("summary-1"), { pick: policy("craft"), limit: 150 });
    const save = toSave(played.state, played.actions);
    const replay = replayRun(save);
    if (!replay.valid) throw new Error(replay.error);
    const summary = summariseRun(replay.state);
    expect(summary.rules).toBe(RULES_FINGERPRINT);
    expect(summary.seed).toBe("summary-1");
    expect(summary.turns).toBe(played.state.turn);
    expect(summary.ticketsDelivered).toBe(played.state.ticketsDelivered);
    expect(summary.outcome).toBe(
      played.state.phase.kind === "game_over" ? played.state.phase.reason : "running",
    );
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  test("a fresh run summarises to zeros", () => {
    const summary = summariseRun(newRun("zero"));
    expect(summary.sprints).toBe(0);
    expect(summary.ticketsDelivered).toBe(0);
    expect(summary.reviews).toBe(0);
    expect(summary.upgrades).toEqual({});
  });
});

describe("the sample schema", () => {
  test("takes a save and the tab's two facts, nothing about the run's numbers", () => {
    const played = play(newRun("schema-1"), { pick: policy("ai"), limit: 30 });
    const save = toSave(played.state, played.actions);
    const parsed = RunSampleInputSchema.safeParse({
      save,
      kind: "checkpoint",
      locale: "fr",
      sessionMs: 1234,
      idle: { enabled: true, speed: 10 },
    });
    expect(parsed.success).toBe(true);
    expect(
      RunSampleInputSchema.safeParse({
        save,
        kind: "final",
        locale: "de",
        sessionMs: 0,
        idle: { enabled: false, speed: 1 },
      }).success,
    ).toBe(false);
    expect(
      RunSampleInputSchema.safeParse({
        save,
        kind: "final",
        locale: "fr",
        sessionMs: -1,
        idle: { enabled: false, speed: 1 },
      }).success,
    ).toBe(false);
  });
});

function row(
  seed: string,
  kind: SampleRow["kind"],
  limit: number,
  extra: Partial<SampleRow> = {},
): SampleRow {
  const played = play(newRun(seed), { pick: policy("craft"), limit });
  const summary: RunSummary = summariseRun(played.state);
  return {
    clientRunId: seed,
    kind,
    sprint: summary.sprints,
    locale: "fr",
    sessionMs: 60_000,
    idle: { enabled: true, speed: 10 },
    summary,
    createdAt: new Date(0),
    ...extra,
  };
}

describe("the digest", () => {
  test("quantiles", () => {
    expect(quantiles([])).toEqual({ n: 0, min: 0, p10: 0, p50: 0, p90: 0, max: 0, mean: 0 });
    const q = quantiles([5, 1, 3, 2, 4]);
    expect(q).toMatchObject({ n: 5, min: 1, p50: 3, max: 5, mean: 3 });
  });

  test("keeps one row per run: the final over the abandoned over the furthest checkpoint", () => {
    const rows = [
      row("a", "checkpoint", 40, { sprint: 1 }),
      row("a", "checkpoint", 80, { sprint: 2 }),
      row("b", "checkpoint", 40, { sprint: 1 }),
      row("b", "abandoned", 60, { sprint: 2 }),
      row("c", "checkpoint", 40, { sprint: 1 }),
      row("c", "final", 200, { sprint: 5 }),
    ];
    const kept = latestPerRun(rows).map((r) => `${r.clientRunId}:${r.kind}:${r.sprint}`);
    expect(kept.sort()).toEqual(["a:checkpoint:2", "b:abandoned:2", "c:final:5"]);
  });

  test("aggregates runs, then renders them as Markdown with the balance quoted", () => {
    const rows = [
      row("d1", "final", 300),
      row("d2", "final", 300),
      row("d3", "abandoned", 50),
      row("d3", "checkpoint", 20, { sprint: 0 }),
    ];
    const digest = digestSamples(rows);
    expect(digest.samples).toBe(4);
    expect(digest.runs).toBe(3);
    expect(digest.byKind).toEqual({ final: 2, abandoned: 1, checkpoint: 1 });
    expect(digest.spread.sprints?.n).toBe(3);
    expect(digest.abandoned.sprints?.n).toBe(1);
    expect(digest.idle).toMatchObject({ runs: 3, enabled: 3, speeds: { x10: 3 } });
    expect(digest.commits.craft?.tried).toBeGreaterThan(0);
    const total = Object.values(digest.tickets).reduce((sum, e) => sum + e.arrived, 0);
    expect(total).toBe(
      rows
        .slice(0, 3)
        .reduce(
          (sum, r) => sum + Object.values(r.summary.arrivedByKind).reduce((a, b) => a + b, 0),
          0,
        ),
    );

    const markdown = renderDigestMarkdown(digest, {
      rules: "all",
      generatedAt: new Date(0),
      balance: { economy: { startingMoney: 100 } },
    });
    expect(markdown).toContain("# Devgame — balancing digest");
    expect(markdown).toContain("3 distinct runs");
    expect(markdown).toContain("| craft |");
    expect(markdown).toContain('"startingMoney": 100');
    expect(markdown).toContain("## How to read this");
  });

  test("an empty table renders without a table", () => {
    const markdown = renderDigestMarkdown(digestSamples([]));
    expect(markdown).toContain("0 samples over 0 distinct runs");
    expect(markdown).not.toContain(
      "| craft | 0 | 0 | — |\n\n### Hacks\n\n| tried | won | win rate |\n|---|---|---|\n| 0 | 0 | — |\n\n## Pace",
    );
  });
});
