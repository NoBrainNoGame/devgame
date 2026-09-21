import { describe, expect, test } from "bun:test";

import { emptyMeta, MetaProgressSchema } from "@/game/dto/meta";
import { migrate } from "@/game/dto/migrations";
import { isCurrentRules, replayRun } from "@/game/dto/replay";
import { MAX_ACTIONS, PlayerActionSchema, RunSaveSchema } from "@/game/dto/run";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

import { isCommit, newRun, play, prefer } from "./helpers";

function saveFor(seed: string, overrides: Record<string, unknown> = {}) {
  const live = play(newRun(seed), { pick: prefer(isCommit("ai"), isCommit("craft")), limit: 60 });
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

describe("PlayerActionSchema", () => {
  test("accepts every action the engine produces", () => {
    const live = play(newRun("dto-actions"), {
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 80,
    });
    for (const action of live.actions) {
      expect(PlayerActionSchema.safeParse(action).success).toBe(true);
    }
  });

  test("rejects an unknown action type", () => {
    expect(PlayerActionSchema.safeParse({ type: "deploy" }).success).toBe(false);
  });

  test("rejects a malformed node id", () => {
    expect(PlayerActionSchema.safeParse({ type: "move", nodeId: "main" }).success).toBe(false);
    expect(PlayerActionSchema.safeParse({ type: "move", nodeId: "2:7" }).success).toBe(true);
  });

  test("rejects an unknown DevOps or relic id", () => {
    expect(PlayerActionSchema.safeParse({ type: "devops", id: "kubernetes" }).success).toBe(false);
    expect(PlayerActionSchema.safeParse({ type: "choose_relic", relicId: "beanbag" }).success).toBe(
      false,
    );
  });
});

describe("RunSaveSchema", () => {
  test("accepts a real save", () => {
    expect(RunSaveSchema.safeParse(saveFor("dto-save")).success).toBe(true);
  });

  test("carries no score for the client to lie about", () => {
    const parsed = RunSaveSchema.parse(saveFor("dto-score", { score: 9999 }));
    expect("score" in parsed).toBe(false);
  });

  test("refuses a log longer than a run can be", () => {
    const tooLong = saveFor("dto-long", {
      actions: Array.from({ length: MAX_ACTIONS + 1 }, () => ({ type: "review" })),
    });
    expect(RunSaveSchema.safeParse(tooLong).success).toBe(false);
  });

  test("requires a well-formed idempotency key and timestamp", () => {
    expect(RunSaveSchema.safeParse(saveFor("dto-id", { clientRunId: "abc" })).success).toBe(false);
    expect(RunSaveSchema.safeParse(saveFor("dto-date", { createdAt: "yesterday" })).success).toBe(
      false,
    );
  });
});

describe("MetaProgressSchema", () => {
  test("a brand new player validates", () => {
    expect(MetaProgressSchema.safeParse(emptyMeta("2026-09-21T10:00:00.000Z")).success).toBe(true);
  });

  test("counters cannot go negative", () => {
    const meta = emptyMeta("2026-09-21T10:00:00.000Z");
    expect(MetaProgressSchema.safeParse({ ...meta, xp: -1 }).success).toBe(false);
    expect(MetaProgressSchema.safeParse({ ...meta, level: 0 }).success).toBe(false);
  });

  test("unknown unlocks are refused", () => {
    const meta = emptyMeta("2026-09-21T10:00:00.000Z");
    expect(MetaProgressSchema.safeParse({ ...meta, unlockedSkills: ["telepathy"] }).success).toBe(
      false,
    );
  });
});

describe("replayRun", () => {
  test("scores a genuine log", () => {
    const result = replayRun(saveFor("dto-replay"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.score).toBeGreaterThan(0);
    expect(result.stats.commits).toBeGreaterThan(0);
  });

  test("refuses malformed input rather than throwing", () => {
    const result = replayRun({ nonsense: true });
    expect(result.valid).toBe(false);
  });

  test("refuses a log that keeps going after the run ended", () => {
    const live = play(newRun("dto-past-end"), {
      pick: prefer(isCommit("ai")),
      limit: 600,
    });
    if (live.state.phase.kind !== "game_over") return;

    const result = replayRun(
      saveFor("dto-past-end", {
        seed: "dto-past-end",
        actions: [...live.actions, { type: "review" }],
        unlockedSkills: live.state.unlockedSkills,
        statPoints: live.state.statPoints,
      }),
    );
    expect(result.valid).toBe(false);
  });

  test("reports the XP the run earned, which is what the server awards", () => {
    const live = play(newRun("dto-xp"), {
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 400,
    });
    if (live.state.xpEarned === 0) return;

    const result = replayRun(
      saveFor("dto-xp", {
        seed: "dto-xp",
        actions: live.actions,
        unlockedSkills: live.state.unlockedSkills,
        statPoints: live.state.statPoints,
      }),
    );

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.stats.xp).toBe(live.state.xpEarned);
    expect(result.stats.xp).toBeGreaterThan(0);
  });

  test("reports whether the run finished", () => {
    const result = replayRun(saveFor("dto-unfinished"));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(typeof result.finished).toBe("boolean");
  });
});

describe("versioning", () => {
  test("a save from the future is refused, not guessed at", () => {
    const save = RunSaveSchema.parse(saveFor("dto-future", { version: SAVE_VERSION + 1 }));
    const result = migrate(save);
    expect(result.ok).toBe(false);
  });

  test("a current save needs no migration", () => {
    const save = RunSaveSchema.parse(saveFor("dto-current"));
    const result = migrate(save);
    expect(result.ok).toBe(true);
  });

  test("a save played against other rules is flagged", () => {
    expect(isCurrentRules({ rules: RULES_FINGERPRINT })).toBe(true);
    expect(isCurrentRules({ rules: "00000000" })).toBe(false);
  });
});
