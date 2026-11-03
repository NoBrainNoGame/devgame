import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  LESSON_IDS,
  LESSONS,
  nextLesson,
  TURNS_BETWEEN_LESSONS,
  type TutorialContext,
} from "@/components/tutorial/lessons";
import type { RunSnapshot } from "@/game";
import { toSnapshot } from "@/game/bridge/snapshot";
import { SOLO_SEAT } from "@/game/core/rules/crew";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { inHand, newRun } from "./helpers";

function solo(snapshot: RunSnapshot | null, patch: Partial<TutorialContext> = {}): TutorialContext {
  return { where: "stage", multi: false, snapshot, round: null, upgradesNews: false, ...patch };
}

/** Every `data-tutorial` value written in the app's sources. */
function anchorsInSources(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".tsx")) {
        for (const match of readFileSync(path, "utf8").matchAll(/data-tutorial="([^"]+)"/g)) {
          for (const anchor of (match[1] ?? "").split(" ")) found.add(anchor);
        }
      }
    }
  };
  walk(join(import.meta.dir, "../src"));
  return found;
}

describe("the lessons", () => {
  test("ids are unique and fit the settings' bounds", () => {
    expect(new Set(LESSON_IDS).size).toBe(LESSON_IDS.length);
    // `SettingsSchema.tutorial.done`: 64 ids of 40 characters at most.
    expect(LESSON_IDS.length).toBeLessThanOrEqual(64);
    for (const id of LESSON_IDS) expect(id.length).toBeLessThanOrEqual(40);
  });

  test("every step has a title and a body in both languages, and nothing more", () => {
    for (const messages of [fr, en]) {
      const lessons = messages.tutorial.lessons as Record<
        string,
        Record<string, { title: string; body: string }>
      >;
      expect(Object.keys(lessons).sort()).toEqual([...LESSON_IDS].sort());
      for (const lesson of LESSONS) {
        const steps = lessons[lesson.id] ?? {};
        expect(Object.keys(steps).sort()).toEqual(
          Array.from({ length: lesson.steps }, (_, i) => `s${i + 1}`).sort(),
        );
        for (const step of Object.values(steps)) {
          expect(step.title.length).toBeGreaterThan(0);
          expect(step.body.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("every anchor is an element the HUD draws", () => {
    // A renamed or removed `data-tutorial` would light up nothing, silently.
    const anchors = anchorsInSources();
    for (const lesson of LESSONS) {
      if (lesson.anchor !== undefined) expect(anchors).toContain(lesson.anchor);
    }
  });
});

describe("what is taught when", () => {
  test("a new run is welcomed, then sent to the board, nothing else", () => {
    const snapshot = toSnapshot(newRun("tutorial-a"), SOLO_SEAT);
    expect(nextLesson(solo(snapshot), new Set(), null)?.id).toBe("welcome");
    expect(nextLesson(solo(snapshot), new Set(["welcome"]), 0)?.id).toBe("board");
    expect(nextLesson(solo(snapshot), new Set(["welcome", "board"]), 0)).toBeNull();
  });

  test("a ticket in hand teaches the commit, at once", () => {
    const snapshot = toSnapshot(inHand("tutorial-b"), SOLO_SEAT);
    expect(nextLesson(solo(snapshot), new Set(["welcome", "board"]), snapshot.turn)?.id).toBe(
      "commit",
    );
  });

  test("a lesson done or skipped is never taught again", () => {
    const snapshot = toSnapshot(inHand("tutorial-c"), SOLO_SEAT);
    const done = new Set(LESSON_IDS);
    expect(nextLesson(solo(snapshot), done, null)).toBeNull();
  });

  test("lessons that are not essential wait a few turns after the last one", () => {
    const base = toSnapshot(inHand("tutorial-d"), SOLO_SEAT);
    const tired = { ...base, player: { ...base.player, energy: 1 } };
    const done = new Set(["welcome", "board", "commit"]);
    expect(nextLesson(solo(tired), done, tired.turn)).toBeNull();
    expect(nextLesson(solo(tired), done, tired.turn - TURNS_BETWEEN_LESSONS)?.id).toBe("energy");
  });

  test("nothing is taught while the run asks a question", () => {
    const base = toSnapshot(newRun("tutorial-e"), SOLO_SEAT);
    const asking = { ...base, phase: { kind: "choose_relic" as const, offer: [] } };
    expect(nextLesson(solo(asking), new Set(), null)).toBeNull();
  });

  test("solo and company lessons stay in their mode", () => {
    const snapshot = toSnapshot(newRun("tutorial-f"), SOLO_SEAT);
    // Solo never meets the company's round, the company never the Auto switch.
    expect(
      nextLesson(solo(snapshot, { round: { mine: false, misses: 2 } }), new Set(["welcome"]), null)
        ?.id,
    ).toBe("board");
    const late = { ...snapshot, turn: 40 };
    const company = solo(late, { multi: true });
    const seen = new Set(LESSON_IDS.filter((id) => id !== "idle"));
    expect(nextLesson(company, seen, null)).toBeNull();
  });

  test("the lobby teaches the lobby only", () => {
    const lobby: TutorialContext = {
      where: "lobby",
      multi: true,
      snapshot: null,
      round: null,
      upgradesNews: false,
    };
    expect(nextLesson(lobby, new Set(), null)?.id).toBe("lobby");
    expect(nextLesson(lobby, new Set(["lobby"]), null)).toBeNull();
  });
});
