import { describe, expect, test } from "bun:test";

import { advancePushes, emptyPushes, isBornLocal, type PushLedger } from "@/game/bridge/pushes";
import { rebuildRun } from "@/game/bridge/rebuild";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import type { GameEvent, PlayerAction, RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

import { newRun, policy } from "./helpers";

interface Step {
  before: PushLedger;
  after: PushLedger;
  ops: ReturnType<typeof advancePushes>["ops"];
  events: GameEvent[];
  state: RunState;
}

/** A run played with the given hand, its ledger folded batch after batch. */
function ledgerRun(seed: string, hand: "ai" | "craft", limit = 150) {
  let state = newRun(seed);
  let ledger = emptyPushes();
  const steps: Step[] = [];
  const actions: PlayerAction[] = [];
  for (let i = 0; i < limit && state.phase.kind !== "game_over"; i += 1) {
    const action = policy(hand)(state, getAvailableActions(state));
    if (action === undefined) break;
    const result = applyAction(state, action);
    const pushed = advancePushes(ledger, result.events, result.state);
    steps.push({
      before: ledger,
      after: pushed.ledger,
      ops: pushed.ops,
      events: result.events,
      state: result.state,
    });
    actions.push(action);
    state = result.state;
    ledger = pushed.ledger;
  }
  return { steps, actions, ledger };
}

const SEEDS = Array.from({ length: 40 }, (_, i) => `push-${i}`);
const runs = SEEDS.map((seed, i) => ({ seed, ...ledgerRun(seed, i % 5 === 0 ? "craft" : "ai") }));

describe("the push ledger", () => {
  test("a commit that went through is pushed in its own batch", () => {
    let seen = 0;
    for (const run of runs) {
      for (const step of run.steps) {
        const broke = new Set(
          step.events.flatMap((e) =>
            e.type === "incident" && e.source === "commit" ? [e.nodeId] : [],
          ),
        );
        for (const event of step.events) {
          if (event.type !== "node_done") continue;
          const node = step.state.nodes[event.nodeId];
          if (node === undefined || !isBornLocal(node) || broke.has(node.id)) continue;
          seen += 1;
          expect(step.ops.some((op) => op.kind === "commit" && op.into === node.id)).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("only your own work is ever local, and never a merge", () => {
    for (const run of runs) {
      for (const step of run.steps) {
        for (const id of Object.values(step.after.local).flat()) {
          const node = step.state.nodes[id];
          expect(node).toBeDefined();
          if (node === undefined) continue;
          expect(isBornLocal(node)).toBe(true);
          expect(node.commit.author).toBeUndefined();
        }
      }
    }
  });

  test("pushed together, local commits fold into the most recent, the one that stays", () => {
    let folds = 0;
    for (const run of runs) {
      for (const step of run.steps) {
        for (const op of step.ops) {
          expect(op.nodeIds[op.nodeIds.length - 1]).toBe(op.into);
          const older = op.nodeIds.slice(0, -1);
          if (older.length === 0) continue;
          folds += 1;
          const wasLocal = new Set(Object.values(step.before.local).flat());
          for (const id of older) {
            expect(wasLocal.has(id)).toBe(true);
            expect(step.after.absorbed[id]).toBe(op.into);
          }
          // The one that stays is the newest: the tip of its column.
          const depths = op.nodeIds.map((id) => step.state.nodes[id]?.depth ?? -1);
          expect(Math.max(...depths)).toBe(step.state.nodes[op.into]?.depth ?? -2);
        }
      }
    }
    expect(folds).toBeGreaterThan(0);
  });

  test("a pull request and a merge push the branch first", () => {
    let seen = 0;
    for (const run of runs) {
      for (const step of run.steps) {
        for (const event of step.events) {
          if (event.type !== "pr_reviewed" && event.type !== "ticket_merged") continue;
          seen += 1;
          expect(step.after.local[event.ticketId]).toBeUndefined();
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("replaying the log gives the ledger the batches built", () => {
    for (const run of runs.slice(0, 10)) {
      let replayed = emptyPushes();
      rebuildRun(
        { seed: run.seed, mode: "classic", profileId: "junior", version: SAVE_VERSION },
        run.actions,
        (events, state) => {
          replayed = advancePushes(replayed, events, state).ledger;
        },
      );
      expect(replayed).toEqual(run.ledger);
    }
  });

  test("a restarted ticket's commits are forgotten", () => {
    const state = newRun("push-restart");
    const ledger: PushLedger = { local: { t1: ["1:5", "1:7"] }, absorbed: { "1:3": "1:4" } };
    const { ledger: after } = advancePushes(
      ledger,
      [{ type: "ticket_restarted", ticketId: "t1", nodeIds: ["1:5", "1:7", "1:3"] }],
      state,
    );
    expect(after.local).toEqual({});
    expect(after.absorbed).toEqual({});
  });
});
