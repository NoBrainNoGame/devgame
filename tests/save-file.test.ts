import { describe, expect, test } from "bun:test";

import { emptyMeta, MetaProgressSchema } from "@/game/dto/meta";
import type { RunSaveDto } from "@/game/dto/run";
import { parseSaveFile, SAVE_FILE_MAX_BYTES } from "@/game/dto/saveFile";
import { SAVE_VERSION } from "@/game/dto/version";
import { exportSave, planImport, saveFileName } from "@/lib/storage/transfer";

const NOW = "2026-09-25T12:00:00.000Z";

function run(id: string, length: number): RunSaveDto {
  return {
    version: SAVE_VERSION,
    rules: "test",
    seed: "seed",
    mode: "classic",
    profileId: "junior",
    unlockedSkills: [],
    startingSkillPoints: 1,
    actions: Array.from({ length }, () => ({ type: "rest" as const })),
    clientRunId: id,
    createdAt: NOW,
  };
}

const A = "5f0c4a52-4b6f-4c9e-9a57-0a1c1a0f4c11";
const B = "7d1e5b63-5c7a-4d0f-8b68-1b2d2b1f5d22";

describe("settings", () => {
  test("a meta saved before the levels existed still parses, with the defaults", () => {
    const old = emptyMeta(NOW);
    const { musicVolume: _music, sfxVolume: _sfx, ...before } = old.settings;
    const parsed = MetaProgressSchema.parse({ ...old, settings: before });
    expect(parsed.settings.musicVolume).toBe(60);
    expect(parsed.settings.sfxVolume).toBe(80);
  });

  test("a level outside 0–100 is refused", () => {
    const meta = emptyMeta(NOW);
    expect(
      MetaProgressSchema.safeParse({ ...meta, settings: { ...meta.settings, sfxVolume: 101 } })
        .success,
    ).toBe(false);
  });
});

describe("the save file", () => {
  test("an export reads back as it was written", () => {
    const file = exportSave(emptyMeta(NOW), run(A, 3), NOW);
    const parsed = parseSaveFile(JSON.stringify(file));
    expect(parsed).toEqual({ ok: true, file });
    expect(saveFileName(NOW)).toBe("devgame-2026-09-25.json");
  });

  test("anything else is refused, and says why", () => {
    expect(parseSaveFile("{ not json")).toEqual({ ok: false, reason: "not_json" });
    expect(parseSaveFile(JSON.stringify({ kind: "devgame-save" }))).toEqual({
      ok: false,
      reason: "not_a_save",
    });
    expect(parseSaveFile(" ".repeat(SAVE_FILE_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: "too_large",
    });
    // A hostile file cannot smuggle an impossible level in.
    const file = exportSave(emptyMeta(NOW), null, NOW);
    expect(parseSaveFile(JSON.stringify({ ...file, meta: { ...file.meta, level: 5000 } })).ok).toBe(
      false,
    );
  });
});

describe("importing", () => {
  const here = { ...emptyMeta(NOW), level: 7, commitsBank: 400 };
  const older = { ...emptyMeta("2026-09-01T00:00:00.000Z"), level: 3, commitsBank: 900 };

  test("progress is merged, never lowered", () => {
    const plan = planImport({ meta: here, run: null }, exportSave(older, null, NOW));
    expect(plan.meta.level).toBe(7);
    expect(plan.meta.commitsBank).toBe(900);
  });

  test("the same run keeps its longer log; another replaces the one here, and says so", () => {
    expect(
      planImport({ meta: here, run: run(A, 10) }, exportSave(older, run(A, 4), NOW)),
    ).toMatchObject({
      run: { clientRunId: A, actions: { length: 10 } },
      replacesRun: false,
    });
    expect(
      planImport({ meta: here, run: run(A, 10) }, exportSave(older, run(B, 4), NOW)),
    ).toMatchObject({
      run: { clientRunId: B },
      replacesRun: true,
    });
    expect(planImport({ meta: here, run: run(A, 10) }, exportSave(older, null, NOW))).toMatchObject(
      {
        run: { clientRunId: A },
        replacesRun: false,
      },
    );
    expect(planImport({ meta: here, run: null }, exportSave(older, run(B, 4), NOW))).toMatchObject({
      run: { clientRunId: B },
      replacesRun: false,
    });
  });
});
