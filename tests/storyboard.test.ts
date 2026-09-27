import { describe, expect, test } from "bun:test";

import { advancePushes, emptyPushes, type PushLedger, type PushOp } from "@/game/bridge/pushes";
import { RevealSet } from "@/game/bridge/reveal";
import { headOf } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import type { GameEvent, RunState } from "@/game/core/types";
import { nodeY } from "@/game/render/coords";
import { planBatch, type Step } from "@/game/render/storyboard";

import { inHand, newRun, play, policy } from "./helpers";

interface Batch {
  before: RunState;
  after: RunState;
  events: GameEvent[];
  /** Which commits were pushed before the batch, and after it. */
  ledger: PushLedger;
  ledgerAfter: PushLedger;
  ops: PushOp[];
}

const translate = (text: { key: string }): string => text.key;

/** Every batch of a run, played with the given hand, until it ends or `limit`. */
function batchesOf(seed: string, hand: "ai" | "craft", limit = 120): Batch[] {
  const batches: Batch[] = [];
  let state = newRun(seed);
  let ledger = emptyPushes();
  for (let i = 0; i < limit && state.phase.kind !== "game_over"; i += 1) {
    const action = policy(hand)(state, getAvailableActions(state));
    if (action === undefined) break;
    const result = applyAction(state, action);
    const pushed = advancePushes(ledger, result.events, result.state);
    batches.push({
      before: state,
      after: result.state,
      events: result.events,
      ledger,
      ledgerAfter: pushed.ledger,
      ops: pushed.ops,
    });
    state = result.state;
    ledger = pushed.ledger;
  }
  return batches;
}

/** What the screen shows after a batch's steps, starting from `before`. */
function playSteps(before: RunState, ledger: PushLedger, steps: Step[]): RevealSet {
  const reveal = new RevealSet();
  reveal.showAll(before, ledger);
  for (const step of steps) {
    if (step.kind === "reveal") reveal.showNode(step.nodeId, step.asHead, step.local);
    if (step.kind === "fuse") reveal.absorb(step.nodeIds, step.into);
    if (step.kind === "push") reveal.push(step.nodeId);
  }
  return reveal;
}

const SEEDS = Array.from({ length: 50 }, (_, i) => `story-${i}`);

describe("the storyboard", () => {
  test("nothing pops on a commit before that commit is on screen", () => {
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, seed.endsWith("7") ? "craft" : "ai")) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate);

        for (const step of steps) {
          if (step.kind === "reveal") reveal.showNode(step.nodeId, step.asHead);
          if (step.kind === "pop" || step.kind === "flash") {
            expect(reveal.nodes.has(step.anchor)).toBe(true);
          }
        }
      }
    }
  });

  test("every commit the batch wrote is revealed, exactly once, in the order written", () => {
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate);

        const written = Object.keys(batch.after.nodes).filter((id) => !(id in batch.before.nodes));
        const reveals = steps.filter(
          (s): s is Extract<Step, { kind: "reveal" }> => s.kind === "reveal",
        );
        const revealed = reveals.map((s) => s.nodeId);

        expect(new Set(revealed).size).toBe(revealed.length);
        expect([...revealed].sort()).toEqual([...written].sort());

        const done = batch.events
          .filter((e): e is Extract<GameEvent, { type: "node_done" }> => e.type === "node_done")
          .map((e) => e.nodeId);
        expect(revealed).toEqual(done);

        // After the reveals, the screen is the engine's state — including
        // where `HEAD` ends up once the final look hands it back.
        // A restarted ticket's commits leave the state; the end of the batch
        // prunes them from the screen, so only what still exists is compared.
        const shown = playSteps(batch.before, batch.ledger, steps);
        const kept = [...shown.nodes].filter((id) => id in batch.after.nodes);
        expect(kept.sort()).toEqual(Object.keys(batch.after.nodes).sort());
      }
    }
  });

  test("a commit's cost lands on that commit; a missed roll's cost lands on the head", () => {
    let onCommit = 0;
    let onHead = 0;

    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate);

        // The commit's own node, if it landed: the one the head moved to. A
        // team's commit or a release written in the same batch is somebody
        // else's.
        const done = batch.events.find(
          (e) => e.type === "node_done" && e.nodeId === headOf(batch.after).id,
        );
        const spent = batch.events.find((e) => e.type === "energy" && e.reason === "commit");
        if (spent === undefined) continue;

        const pop = steps.find((s) => s.kind === "pop" && s.cue?.gauge === "energy");
        if (pop === undefined || pop.kind !== "pop") continue;

        if (done?.type === "node_done") {
          expect(pop.anchor).toBe(done.nodeId);
          onCommit += 1;
        } else {
          expect(pop.anchor).toBe(headOf(batch.before).id);
          onHead += 1;
        }
      }
    }

    expect(onCommit).toBeGreaterThan(0);
    expect(onHead).toBeGreaterThan(0);
  });

  test("a merge's rest lands on the merge, and a release is never the head", () => {
    let merges = 0;
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        const merged = batch.events.find((e) => e.type === "ticket_merged");
        if (merged?.type !== "ticket_merged") continue;
        // A merge that closes the sprint is followed by the release's own rest,
        // which lands elsewhere; the rest under test is the merge's.
        if (batch.events.some((e) => e.type === "sprint_ended")) continue;
        // Only a merge that gives a rest: one landed by a commit gives none, and
        // the next turn's energy, later in the batch, lands on the head.
        const at = batch.events.indexOf(merged);
        const nextTurn = batch.events.findIndex((e, i) => i > at && e.type === "turn_started");
        const rest = batch.events
          .slice(at, nextTurn === -1 ? undefined : nextTurn)
          .some((e) => e.type === "energy" && e.delta > 0);
        if (!rest) continue;
        merges += 1;

        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate);

        const regen = steps.find(
          (s) => s.kind === "pop" && s.cue?.gauge === "energy" && s.cue.delta > 0,
        );
        if (regen?.kind === "pop") expect(regen.anchor).toBe(merged.nodeId);

        for (const step of steps) {
          if (step.kind !== "reveal") continue;
          const node = batch.after.nodes[step.nodeId];
          if (node?.lane === 0) expect(step.asHead).toBe(false);
        }
      }
    }
    expect(merges).toBeGreaterThan(0);
  });

  test("a checkout looks at the ticket picked up, then hands the camera back", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      // Two tickets open, a few commits on the first, then a switch.
      const one = inHand(seed);
      const start = getAvailableActions(one).find((a) => a.type === "start");
      if (start === undefined) continue;
      const two = play(applyAction(one, start).state, { pick: policy("craft"), limit: 3 }).state;
      if (two.phase.kind !== "choose_action") continue;
      const other = getAvailableActions(two).find((a) => a.type === "checkout");
      if (other === undefined) continue;

      const result = applyAction(two, other);
      const reveal = new RevealSet();
      reveal.showAll(two, emptyPushes());
      const steps = planBatch(result.events, result.state, reveal.snapshot(), translate);

      const looks = steps.filter((s): s is Extract<Step, { kind: "look" }> => s.kind === "look");
      expect(looks[0]?.y).toBe(nodeY(headOf(result.state).depth));
      expect(looks[looks.length - 1]?.y).toBeNull();
    }
  });

  test("a batch with nothing to show is a single beat", () => {
    const state = newRun("beat");
    const steps = planBatch([], state, new RevealSet().snapshot(), translate);
    expect(steps).toEqual([{ kind: "beat", hold: expect.any(Number) }]);
  });
});

describe("the pops that move the HUD", () => {
  const cuesOf = (steps: Step[]) =>
    steps.flatMap((step) => (step.kind === "pop" && step.cue !== undefined ? [step.cue] : []));

  test("every gauge figure carries a cue, in the gauge's own terms, in order", () => {
    let seen = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      for (const batch of batchesOf(seed, "ai", 80)) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const cues = cuesOf(planBatch(batch.events, batch.after, reveal.snapshot(), translate));
        for (let i = 1; i < cues.length; i += 1) {
          expect(cues[i]?.serial ?? 0).toBeGreaterThan(cues[i - 1]?.serial ?? 0);
        }
        for (const cue of cues) {
          seen += 1;
          expect(cue.delta).not.toBe(0);
          // The blur of the code's health is only known at the end of the batch.
          if (cue.gauge === "health") expect(cue.value).toBeNull();
          if (cue.gauge === "patience") {
            const deltas = batch.events.flatMap((e) => (e.type === "quality" ? [-e.delta] : []));
            expect(deltas).toContain(cue.delta);
          }
          if (cue.gauge === "energy") {
            const values = batch.events.flatMap((e) => (e.type === "energy" ? [e.value] : []));
            expect(values).toContain(cue.value ?? Number.NaN);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("a payday rises as one net figure, and a purchase raises none", () => {
    let paydays = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      for (const batch of batchesOf(seed, "craft", 120)) {
        if (!batch.events.some((e) => e.type === "month_closed")) continue;
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const money = cuesOf(
          planBatch(batch.events, batch.after, reveal.snapshot(), translate),
        ).filter((cue) => cue.gauge === "money");
        const quiet = cuesOf(
          planBatch(batch.events, batch.after, reveal.snapshot(), translate, {
            economyPops: false,
          }),
        ).filter((cue) => cue.gauge === "money" || cue.gauge === "skills");
        expect(quiet).toEqual([]);
        if (money.length === 0) continue;
        paydays += 1;
        const net = batch.events.reduce((sum, e) => sum + (e.type === "money" ? e.delta : 0), 0);
        expect(money.reduce((sum, cue) => sum + cue.delta, 0)).toBe(net);
      }
    }
    expect(paydays).toBeGreaterThan(0);
  });
});

describe("local and pushed commits on screen", () => {
  const sorted = (ids: Iterable<string>): string[] => [...ids].sort();

  test("the screen ends a batch where the ledger does", () => {
    let fused = 0;
    let broke = 0;
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate, {
          pushes: batch.ops,
        });
        const shown = playSteps(batch.before, batch.ledger, steps);

        const exists = (id: string): boolean => id in batch.after.nodes;
        expect(sorted([...shown.local].filter(exists))).toEqual(
          sorted(Object.values(batch.ledgerAfter.local).flat()),
        );
        expect(Object.fromEntries([...shown.absorbed].filter(([id]) => exists(id)))).toEqual(
          batch.ledgerAfter.absorbed,
        );

        fused += steps.filter((step) => step.kind === "fuse").length;
        broke += batch.events.filter((e) => e.type === "incident" && e.source === "commit").length;
      }
    }
    expect(fused).toBeGreaterThan(0);
    expect(broke).toBeGreaterThan(0);
  });

  test("a commit's own story plays out before it is pushed", () => {
    let pushes = 0;
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        const reveal = new RevealSet();
        reveal.showAll(batch.before, batch.ledger);
        const steps = planBatch(batch.events, batch.after, reveal.snapshot(), translate, {
          pushes: batch.ops,
        });

        // Only pushes of a commit that went through: a pull request is read,
        // and answered, on commits already pushed, as it is in git.
        const byCommit = new Set(
          batch.ops.filter((op) => op.kind === "commit").map((op) => op.into),
        );
        const pushed = new Set<string>();
        const shownSoFar = new Set(reveal.nodes);
        for (const step of steps) {
          if (step.kind === "reveal") shownSoFar.add(step.nodeId);
          if (step.kind === "fuse") {
            expect(shownSoFar.has(step.into)).toBe(true);
            for (const id of step.nodeIds) expect(shownSoFar.has(id)).toBe(true);
          }
          if (step.kind === "push") {
            expect(shownSoFar.has(step.nodeId)).toBe(true);
            if (byCommit.has(step.nodeId)) pushed.add(step.nodeId);
            pushes += 1;
          }
          if (step.kind === "pop" || step.kind === "flash") {
            expect(pushed.has(step.anchor)).toBe(false);
          }
        }
      }
    }
    expect(pushes).toBeGreaterThan(0);
  });

  test("a commit that broke production is left local", () => {
    let seen = 0;
    for (const seed of SEEDS) {
      for (const batch of batchesOf(seed, "ai")) {
        for (const event of batch.events) {
          if (event.type !== "incident" || event.source !== "commit") continue;
          if (!(event.nodeId in batch.after.nodes)) continue;
          seen += 1;
          expect(Object.values(batch.ledgerAfter.local).flat()).toContain(event.nodeId);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
