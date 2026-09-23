import { describe, expect, test } from "bun:test";

import { AMBIENT_FILES, SFX_FILES } from "@/game/audio/manifest";
import { SFX_IDS, sfxFor } from "@/game/audio/sfx";
import { RevealSet } from "@/game/bridge/reveal";
import { planBatch } from "@/game/render/storyboard";

import { newRun, play, policy } from "./helpers";

/**
 * The audio skeleton: every event is classified, a sound never comes before
 * the commit it belongs to, and a skeleton is what it is — no file yet.
 */
describe("sounds", () => {
  test("every event of a long run maps to a known sound or to silence", () => {
    const run = play(newRun("sfx-run"), { pick: policy("ai"), limit: 300 });
    const seen = new Set<string>();
    for (const event of run.events) {
      const id = sfxFor(event);
      if (id !== null) expect(SFX_IDS).toContain(id);
      seen.add(event.type);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  test("a batch has one sound per mapped event, each after its own commit is revealed", () => {
    const run = play(newRun("sfx-batch"), { pick: policy("craft"), limit: 12 });
    const reveal = new RevealSet();
    const state = newRun("sfx-batch");
    reveal.showAll(state);
    const steps = planBatch(run.events, run.state, reveal.snapshot(), () => "");
    const sounds = steps.filter((step) => step.kind === "sfx");
    const mapped = run.events.filter((event) => sfxFor(event) !== null);
    expect(sounds.length).toBe(mapped.length);

    // A commit's sound comes after its reveal, never before.
    const revealedSoFar = new Set<string>(reveal.snapshot().nodes);
    let eventIndex = 0;
    for (const step of steps) {
      if (step.kind === "reveal") revealedSoFar.add(step.nodeId);
      if (step.kind !== "sfx") continue;
      // Walk the events to the one this sound belongs to.
      while (eventIndex < run.events.length && sfxFor(run.events[eventIndex] as never) === null) {
        eventIndex += 1;
      }
      const event = run.events[eventIndex];
      eventIndex += 1;
      if (event?.type === "node_done") expect(revealedSoFar.has(event.nodeId)).toBe(true);
    }
  });

  test("the manifest names every sound and holds no file yet", () => {
    for (const id of SFX_IDS) expect(SFX_FILES[id]).toBeNull();
    expect(AMBIENT_FILES.base).toBeNull();
    expect(AMBIENT_FILES.dread).toBeNull();
  });
});
