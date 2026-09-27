import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { buggedOn, offersOf, openTickets, unreadAiOn } from "@/game/core/rules/tickets";

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

describe("a roll that misses", () => {
  /** The first seed whose first machine commit misses, and what that one action did. */
  function firstMiss(prefix: string) {
    for (let i = 0; i < 60; i += 1) {
      const state = inHand(`${prefix}-${i}`);
      const result = applyAction(state, { type: "commit", mode: "ai" });
      const done = eventsOfType(result.events, "node_done")[0];
      if (done?.broken === true) return { before: state, ...result, done };
    }
    throw new Error("no roll missed in 60 seeds");
  }

  test("writes a broken commit: local, worth nothing, only the commit's energy spent", () => {
    const { before, state, events, done } = firstMiss("broken");

    const node = state.nodes[done.nodeId];
    expect(node?.commit.broken).toBe(true);
    expect(node?.commit.debt).toBeUndefined();
    // Nothing filled, nothing owed.
    expect(eventsOfType(events, "points")).toEqual([]);
    expect(state.debt).toBe(before.debt);
    // The commit's own price, and not a cent more; the turn is spent.
    const spent = eventsOfType(events, "energy").filter((e) => e.delta < 0);
    expect(spent.map((e) => e.reason)).toEqual(["commit"]);
    expect(state.turn).toBe(before.turn + 1);
    // It is on your machine, at the tip of the branch, and counts for nothing:
    // not a commit to your name, not a bug, nothing for a review to read.
    const ticket = ticketInHand(state);
    expect(ticket.nodeIds).toContain(done.nodeId);
    expect(state.player.totalCommits).toBe(before.player.totalCommits);
    expect(state.stats.commitsLanded).toEqual(before.stats.commitsLanded);
    expect(buggedOn(state, ticket)).toEqual([]);
    expect(unreadAiOn(state, ticket)).toEqual([]);
    expect(offersOf(state, ticket)).not.toContain("fix");
  });

  test("the next commit that goes through keeps only the code that worked", () => {
    const { before, state, done } = firstMiss("broken-push");
    const below = ticketInHand(before).nodeIds.at(-1);
    let now = state;
    for (let i = 0; i < 20; i += 1) {
      const result = applyAction(now, { type: "commit", mode: "craft" });
      now = result.state;
      const landed = eventsOfType(result.events, "node_done").find((e) => e.broken !== true);
      if (landed === undefined) continue;
      const ticket = ticketInHand(now);
      // Every broken commit is gone from the ticket; the one that landed is
      // built on the last code that worked, and is the only one counted.
      expect(ticket.nodeIds).not.toContain(done.nodeId);
      expect(ticket.nodeIds.every((id) => now.nodes[id]?.commit.broken !== true)).toBe(true);
      const parent = now.nodes[landed.nodeId]?.parents[0];
      if (below === undefined) expect(now.nodes[parent ?? ""]?.lane).toBe(1);
      else expect(parent).toBe(below);
      expect(now.player.totalCommits).toBe(before.player.totalCommits + 1);
      return;
    }
    throw new Error("no commit landed in 20 tries");
  });

  test("a pull request pushes the branch, and what broke does not go with it", () => {
    // A commit that lands, then one that misses on top of it.
    let state = inHand("broken-pr");
    for (let i = 0; i < 20 && ticketInHand(state).nodeIds.length === 0; i += 1) {
      state = applyAction(state, { type: "commit", mode: "craft" }).state;
    }
    let draft: string | undefined;
    for (let i = 0; i < 40 && draft === undefined; i += 1) {
      const result = applyAction(state, { type: "commit", mode: "ai" });
      state = result.state;
      draft = eventsOfType(result.events, "node_done").find((e) => e.broken === true)?.nodeId;
    }
    if (draft === undefined) throw new Error("no roll missed in 40 tries");

    // A broken commit holds nothing: the pull request opens over it.
    const ready = makeReady(state);
    expect(getAvailableActions(ready).some(isType("submit"))).toBe(true);
    const after = applyAction(ready, { type: "submit" }).state;
    expect(ticketInHand(after).nodeIds).not.toContain(draft);
    expect(after.nodes[draft]).toBeDefined();
  });

  test("monitoring shortens the hotfix", () => {
    expect(BALANCE.failure.hotfixPointsWithMonitoring).toBeLessThan(BALANCE.failure.hotfixPoints);
  });

  test("a hotfix ticket only takes fix commits, and they land in its own column", () => {
    const found = findSeed((r) => r.events.some((e) => e.type === "incident"), {
      prefix: "hotfix-commits",
      pick: policy("ai"),
      limit: 300,
      stop: (_, latest) => latest.some((e) => e.type === "incident"),
    });
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
    // Three hundred runs that now outlive the old ones: give them the time.
  }, 20_000);

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
