import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { openTickets } from "@/game/core/rules/tickets";

import {
  eventsOfType,
  findSeed,
  inHand,
  isCommit,
  isType,
  makeReady,
  newRun,
  plantAiCommit,
  play,
  policy,
  prefer,
  settle,
  submitAndMerge,
  ticketInHand,
} from "./helpers";

describe("failures", () => {
  test("a production bug opens a hotfix ticket and fills the gauge", () => {
    const { state, events } = findSeed(
      (r) => r.events.some((e) => e.type === "incident" && e.source === "commit"),
      { prefix: "hotfix", pick: policy("ai"), limit: 200 },
    );

    const incident = eventsOfType(events, "incident").find((e) => e.source === "commit");
    expect(incident).toBeDefined();
    if (incident === undefined) return;

    const hotfix = state.tickets[incident.ticketId];
    expect(hotfix?.kind).toBe("hotfix");
    expect(hotfix?.mustWrite).toBe("hotfix");
    expect(hotfix?.points).toBe(BALANCE.failure.hotfixPoints);
    expect(state.quality).toBeGreaterThan(0);
  });

  test("a hotfix ticket only takes fix commits, and they land in its own column", () => {
    const found = findSeed(
      (r) => r.events.some((e) => e.type === "incident" && e.source === "commit"),
      {
        prefix: "hotfix-commits",
        pick: policy("ai"),
        limit: 200,
        stop: (_, latest) => latest.some((e) => e.type === "incident"),
      },
    );
    const state = settle(found.state);

    const hotfix = openTickets(state).find((ticket) => ticket.kind === "hotfix");
    expect(hotfix).toBeDefined();
    if (hotfix === undefined) return;

    const onIt = applyAction(state, { type: "checkout", ticketId: hotfix.id }).state;
    const commits = getAvailableActions(onIt).filter(isType("commit"));
    expect(commits.length).toBe(2);
    expect(commits.every((a) => a.type === "commit" && a.kind === undefined)).toBe(true);

    const written = play(onIt, { pick: prefer(isCommit("craft")), limit: 6 });
    for (const done of eventsOfType(written.events, "node_done")) {
      if (done.kind === "sprint_merge" || done.kind === "release") continue;
      const node = written.state.nodes[done.nodeId];
      if (node?.ticketId !== hotfix.id) continue;
      expect(done.kind).toBe("hotfix");
      expect(node.lane).toBeGreaterThanOrEqual(2);
    }
  });

  test("monitoring shortens the hotfix", () => {
    expect(BALANCE.failure.hotfixPointsWithMonitoring).toBeLessThan(BALANCE.failure.hotfixPoints);
  });

  test("a production bug needs unreviewed machine-written code", () => {
    const craftOnly = play(newRun("no-prod-bug"), { pick: policy("craft"), limit: 200 });
    const prodBugs = eventsOfType(craftOnly.events, "failure_event").filter(
      (e) => e.eventId === "prod_bug",
    );
    expect(prodBugs).toEqual([]);
  });

  test("Tests counters a rejected pull request instead of costing points", () => {
    const armed = inHand("pr");
    armed.skills = ["unit_tests"];

    const run = play(armed, { pick: policy("ai"), limit: 300 });
    for (const event of eventsOfType(run.events, "pr_rejected")) {
      expect(event.countered).toBe(true);
    }
  });

  test("a rejected pull request takes points back off the ticket", () => {
    const { events } = findSeed(
      (r) => r.events.some((e) => e.type === "pr_rejected" && !e.countered),
      { prefix: "pr-points", pick: policy("ai"), limit: 300 },
    );

    const taken = eventsOfType(events, "points").filter((e) => e.delta < 0);
    // A ticket with nothing filled yet has nothing to lose, which is the one
    // case the event fires without a points delta.
    for (const event of taken) expect(event.delta).toBe(-BALANCE.failure.prRejectedPoints);
  });

  test("a broken build costs energy and writes nothing", () => {
    const { events } = findSeed(
      (r) => r.events.some((e) => e.type === "failure_event" && e.eventId === "broken_build"),
      { prefix: "broken", pick: policy("ai"), limit: 300 },
    );
    const spent = eventsOfType(events, "energy").filter((e) => e.reason === "broken_build");
    expect(spent[0]?.delta).toBe(-BALANCE.failure.brokenBuildEnergy);
  });

  test("resolving a conflict by hand costs energy, by machine costs debt", () => {
    const { state } = findSeed((r) => r.state.phase.kind === "resolve_conflict", {
      prefix: "conflict-cost",
      pick: policy("ai"),
      limit: 120,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });

    const manual = applyAction(state, { type: "resolve_conflict", how: "manual" });
    const charged = eventsOfType(manual.events, "energy").find(
      (event) => event.reason === "conflict_manual",
    );
    expect(charged?.delta).toBe(-BALANCE.failure.conflictManualEnergy);

    const machine = applyAction(state, { type: "resolve_conflict", how: "ai" });
    const fix = eventsOfType(machine.events, "debt")[0];
    expect(fix?.delta).toBe(BALANCE.debt.perAiConflictFix);

    const spent = eventsOfType(machine.events, "energy").filter(
      (event) => event.reason === "conflict_manual",
    );
    expect(spent).toEqual([]);
  });

  test("a conflict does not cost two turns", () => {
    // Merges are where conflicts come from, and the hand that gets its pull
    // requests accepted is the one that merges.
    const { state } = findSeed((r) => r.state.phase.kind === "resolve_conflict", {
      prefix: "conflict-turn",
      pick: policy("craft"),
      limit: 300,
      stop: (s) => s.phase.kind === "resolve_conflict",
    });

    const after = applyAction(state, { type: "resolve_conflict", how: "ai" }).state;
    expect(after.turn).toBe(state.turn + 1);
  });

  test("a merge conflict resolved by the machine still lands the ticket", () => {
    const { state } = findSeed(
      (r) => r.state.phase.kind === "resolve_conflict" && r.state.phase.source === "merge",
      {
        prefix: "merge-conflict",
        pick: policy("ai"),
        limit: 200,
        stop: (s) => s.phase.kind === "resolve_conflict" && s.phase.source === "merge",
      },
    );
    if (state.phase.kind !== "resolve_conflict") return;
    const ticketId = state.phase.ticketId;

    const after = applyAction(state, { type: "resolve_conflict", how: "ai" }).state;
    expect(after.tickets[ticketId]?.status).toBe("merged");
    expect(after.phase.kind).not.toBe("resolve_conflict");
  });
});

describe("debt explosion", () => {
  test("crossing the threshold forces a refactor ticket open, once", () => {
    const loaded = inHand("explode");
    loaded.debt = BALANCE.debt.explosionThreshold + 5;

    const once = applyAction(loaded, { type: "commit", mode: "craft" });
    const explosions = eventsOfType(once.events, "debt_explosion");
    expect(explosions.length).toBe(1);

    const forced = openTickets(once.state).find((ticket) => ticket.kind === "refactor");
    expect(forced?.mustWrite).toBe("refactor");
    expect(forced?.points).toBe(BALANCE.debt.explosionPoints);
    // Still in hand: the refactor waits rather than yanking you off your ticket.
    expect(once.state.player.ticketId).toBe(loaded.player.ticketId);

    // The debt is still over the line; a second ticket must not open.
    const twice = applyAction(once.state, { type: "commit", mode: "craft" });
    expect(eventsOfType(twice.events, "debt_explosion")).toEqual([]);
  });

  test("landing the forced refactor repays the debt", () => {
    const loaded = inHand("explode-repay");
    loaded.debt = BALANCE.debt.explosionThreshold + 5;
    const exploded = applyAction(loaded, { type: "commit", mode: "craft" }).state;
    const forced = openTickets(exploded).find((ticket) => ticket.kind === "refactor");
    if (forced === undefined) throw new Error("expected a refactor ticket");

    const onIt = makeReady(applyAction(exploded, { type: "checkout", ticketId: forced.id }).state);
    expect(ticketInHand(onIt).id).toBe(forced.id);
    const result = submitAndMerge(onIt);
    if (result.state.phase.kind === "resolve_conflict") return;

    expect(result.state.debt).toBeLessThan(onIt.debt);
  });
});

describe("ambient events", () => {
  test("Dependabot removes the obsolete-dependency event from the table", () => {
    const armed = inHand("dependabot");
    armed.tree.dependabot = 1;

    const run = play(armed, { pick: policy("ai"), limit: 300 });
    const obsolete = eventsOfType(run.events, "ambient_event").filter(
      (e) => e.eventId === "obsolete_lib",
    );
    expect(obsolete).toEqual([]);
  });

  test("a planted commit is what a production bug is traced to", () => {
    const state = inHand("planted");
    plantAiCommit(state);
    expect(ticketInHand(state).nodeIds.length).toBe(1);
  });
});

describe("merge events", () => {
  test("every merge event fires somewhere in three hundred seeds, with its effect", () => {
    const seen = new Map<string, number>();
    let nitpickRegen = 0;
    let migrationPaid = 0;

    for (let i = 0; i < 300; i += 1) {
      // Hand-written: the review accepts clean work, so the merges happen.
      const { events } = play(newRun(`merge-events-${i}`), { pick: policy("craft"), limit: 160 });

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event?.type !== "merge_event") continue;
        seen.set(event.eventId, (seen.get(event.eventId) ?? 0) + 1);

        // What follows in the same batch, up to the next turn.
        const rest = events.slice(index + 1);
        const turn = rest.findIndex((e) => e.type === "turn_started");
        const batch = turn === -1 ? rest : rest.slice(0, turn);

        if (event.eventId === "review_nitpick") {
          if (batch.some((e) => e.type === "energy" && e.reason === "merge_regen")) {
            nitpickRegen += 1;
          }
        }
        if (event.eventId === "new_lib_migration") {
          const paid =
            batch.some((e) => e.type === "energy" && e.reason === "new_lib_migration") ||
            batch.some((e) => e.type === "debt" && e.delta > 0);
          if (paid) migrationPaid += 1;
        }
      }
    }

    for (const id of ["merge_conflict", "new_lib_migration", "flaky_ci", "review_nitpick"]) {
      expect(seen.get(id) ?? 0).toBeGreaterThan(0);
    }
    expect(nitpickRegen).toBe(0);
    expect(migrationPaid).toBe(seen.get("new_lib_migration") ?? 0);
  });

  test("Dependabot removes the library migration from the merge table", () => {
    const armed = inHand("no-migration");
    armed.tree.dependabot = 1;
    const run = play(armed, { pick: policy("ai"), limit: 400 });
    const migrations = eventsOfType(run.events, "merge_event").filter(
      (e) => e.eventId === "new_lib_migration",
    );
    expect(migrations).toEqual([]);
  });
});
