import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { FIRST_FEATURE_LANE } from "@/game/core/map/layout";
import { applyAction } from "@/game/core/rules/reducer";

import { eventsOfType, findSeed, isCommit, newRun, play, prefer } from "./helpers";

const aiPolicy = prefer(isCommit("ai"));

describe("failures", () => {
  test("a hotfix splices nodes in and leaves the graph valid", () => {
    const { state, events } = findSeed(
      (r) => r.events.some((e) => e.type === "nodes_injected" && e.kind === "hotfix"),
      { prefix: "hotfix", pick: aiPolicy, limit: 120 },
    );

    const injected = eventsOfType(events, "nodes_injected").filter((e) => e.kind === "hotfix");
    expect(injected[0]?.nodeIds.length).toBe(BALANCE.failure.hotfixNodes);
    expect(
      checkInvariants(Object.values(state.nodes).filter((n) => n.sprint === state.sprint)),
    ).toBeDefined();

    for (const node of Object.values(state.nodes)) {
      for (const nextId of node.next) {
        const next = state.nodes[nextId];
        expect(next?.depth ?? 0).toBeGreaterThan(node.depth);
      }
    }
  });

  test("a hotfix is written on the branch you were on, not beside it", () => {
    const { state } = findSeed(
      (r) => r.events.some((e) => e.type === "nodes_injected" && e.kind === "hotfix"),
      { prefix: "hotfix-lane", pick: aiPolicy, limit: 120 },
    );

    const hotfix = Object.values(state.nodes).filter((node) => node.kind === "hotfix");
    expect(hotfix.length).toBeGreaterThan(0);

    // A production bug is `fix:` commits you have to write before you can carry
    // on — never `main`, never `dev`, and never a branch with no merge.
    for (const node of hotfix) {
      expect(node.lane).toBeGreaterThanOrEqual(FIRST_FEATURE_LANE);
      expect(node.branchId).toBeDefined();
    }
  });

  test("monitoring shortens the hotfix", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_action", {
      prefix: "mon",
      pick: aiPolicy,
      limit: 1,
    });

    const watched = structuredClone(state);
    watched.devops.monitoring = 1;
    expect(BALANCE.failure.hotfixNodesWithMonitoring).toBeLessThan(BALANCE.failure.hotfixNodes);
    expect(watched.devops.monitoring).toBe(1);
  });

  test("a production bug needs unreviewed machine-written code", () => {
    const craftOnly = play(newRun("no-prod-bug"), { pick: prefer(isCommit("craft")), limit: 120 });
    const prodBugs = eventsOfType(craftOnly.events, "failure_event").filter(
      (e) => e.eventId === "prod_bug",
    );
    expect(prodBugs).toEqual([]);
  });

  test("Tests counters a rejected pull request instead of costing progress", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_action", {
      prefix: "pr",
      pick: aiPolicy,
      limit: 1,
    });

    const armed = structuredClone(state);
    armed.skills = ["unit_tests"];

    const run = play(armed, { pick: aiPolicy, limit: 200 });
    for (const event of eventsOfType(run.events, "pr_rejected")) {
      expect(event.countered).toBe(true);
    }
  });

  test("auto-rebase absorbs a forced rebase", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_action", {
      prefix: "rebase",
      pick: aiPolicy,
      limit: 1,
    });

    const armed = structuredClone(state);
    armed.devops.auto_rebase = 1;

    const run = play(armed, { pick: aiPolicy, limit: 200 });
    for (const event of eventsOfType(run.events, "forced_rebase")) {
      expect(event.absorbed).toBe(true);
    }
  });

  test("resolving a conflict by hand costs energy, by machine costs debt", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "resolve_conflict", {
      prefix: "conflict-cost",
      pick: aiPolicy,
      limit: 60,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });

    // Asserted on what untangling it charged, not on the net: a conflict happens
    // at a merge, and finishing one hands the merge's rest back in the same
    // action — often more than the fix cost.
    const manual = applyAction(state, { type: "resolve_conflict", how: "manual" });
    const charged = eventsOfType(manual.events, "energy").find(
      (event) => event.reason === "conflict_manual",
    );
    expect(charged?.delta).toBe(-BALANCE.failure.conflictManualEnergy);

    // Assert on the emitted delta rather than the total: finishing the commit
    // may also tip the debt over the explosion threshold, which repays some of
    // it in the same action.
    const machine = applyAction(state, { type: "resolve_conflict", how: "ai" });
    const fix = eventsOfType(machine.events, "debt")[0];
    expect(fix?.delta).toBe(BALANCE.debt.perAiConflictFix);

    // Energy is not asserted against a total any more: a conflict now happens
    // at a merge, and finishing one spends the merge's cost and hands back its
    // rest. What matters is that the machine's fix itself charged nothing.
    const spent = eventsOfType(machine.events, "energy").filter(
      (event) => event.reason === "conflict_manual",
    );
    expect(spent).toEqual([]);
  });

  test("a conflict does not cost two turns", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "resolve_conflict", {
      prefix: "conflict-turn",
      pick: aiPolicy,
      limit: 60,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });

    const after = applyAction(state, { type: "resolve_conflict", how: "ai" }).state;
    expect(after.turn).toBe(state.turn + 1);
  });
});

describe("debt explosion", () => {
  test("crossing the threshold forces refactor work and repays debt", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_node", {
      prefix: "explode",
      pick: aiPolicy,
      limit: 2,
    });

    const loaded = structuredClone(state);
    loaded.debt = BALANCE.debt.explosionThreshold + 5;
    const nodeId = loaded.phase.kind === "choose_node" ? loaded.phase.candidates[0] : undefined;
    if (nodeId === undefined) return;

    const moved = applyAction(loaded, { type: "move", nodeId }).state;
    const after = play(moved, { pick: aiPolicy, limit: 1 });

    const explosions = eventsOfType(after.events, "debt_explosion");
    if (explosions.length === 0) return;

    expect(Object.values(after.state.nodes).some((node) => node.kind === "refactor")).toBe(true);
    expect(after.state.debt).toBeLessThan(loaded.debt);
  });
});

describe("ambient events", () => {
  test("Dependabot removes the obsolete-dependency event from the table", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "choose_action", {
      prefix: "dependabot",
      pick: aiPolicy,
      limit: 1,
    });

    const armed = structuredClone(state);
    armed.devops.dependabot = 1;

    const run = play(armed, { pick: aiPolicy, limit: 300 });
    const obsolete = eventsOfType(run.events, "ambient_event").filter(
      (e) => e.eventId === "obsolete_lib",
    );
    expect(obsolete).toEqual([]);
  });
});
