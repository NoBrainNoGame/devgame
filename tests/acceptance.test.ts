import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { buggedOn, mostIndebtedOn, offersOf, openTickets } from "@/game/core/rules/tickets";

import {
  eventsOfType,
  inHand,
  isType,
  makeReady,
  plantAiCommit,
  plantCommit,
  ticketInHand,
} from "./helpers";

describe("the pull request review", () => {
  test("clean work is accepted and lands in the same turn", () => {
    const state = makeReady(inHand("pr-clean"));
    const result = applyAction(state, { type: "submit" });

    const review = eventsOfType(result.events, "pr_reviewed")[0];
    expect(review?.accepted).toBe(true);
    expect(review?.bugs).toBe(0);
    if (result.state.phase.kind === "resolve_conflict") return;
    expect(result.state.tickets[ticketInHand(state).id]?.status).toBe("merged");
  });

  test("debt over the ceiling is refused whatever the code", () => {
    const state = makeReady(inHand("pr-debt"));
    state.debt = BALANCE.acceptance.maxDebt + 1;
    const result = applyAction(state, { type: "submit" });

    expect(eventsOfType(result.events, "pr_reviewed")[0]?.accepted).toBe(false);
    expect(result.state.phase.kind).toBe("ticket_rejected");
    expect(
      getAvailableActions(result.state)
        .map((a) => a.type)
        .sort(),
    ).toEqual(["restart", "resume"]);
  });

  test("unread machine work gets caught, adds fix points, and brings a ticket with it", () => {
    let rejectedOnce = false;
    for (let i = 0; i < 30 && !rejectedOnce; i += 1) {
      const state = makeReady(inHand(`pr-bugs-${i}`));
      for (let n = 0; n < 4; n += 1) plantAiCommit(state);
      const before = ticketInHand(state);
      const openBefore = openTickets(state).length;

      const result = applyAction(state, { type: "submit" });
      const review = eventsOfType(result.events, "pr_reviewed")[0];
      if (review === undefined || review.accepted) continue;
      rejectedOnce = true;

      const after = result.state.tickets[before.id];
      expect(review.bugs).toBeGreaterThan(0);
      expect(after?.points).toBe(before.points + review.bugs * BALANCE.acceptance.pointsPerBug);
      expect(after?.rework).toBe(review.bugs * BALANCE.acceptance.pointsPerBug);
      // The reviewer read them: they are no longer a surprise for the release.
      expect(after?.nodeIds.every((id) => result.state.nodes[id]?.commit.reviewed)).toBe(true);
      // And the ones it caught stay flagged until a fix redoes them.
      if (after !== undefined) expect(buggedOn(result.state, after).length).toBe(review.bugs);
      // And the sprint did not wait.
      expect(openTickets(result.state).length).toBe(openBefore + 1);
      expect(eventsOfType(result.events, "ticket_started").some((e) => e.forced)).toBe(true);
    }
    expect(rejectedOnce).toBe(true);
  });

  test("restarting throws the commits away and the ticket starts from dev", () => {
    const state = makeReady(inHand("pr-restart"));
    state.debt = BALANCE.acceptance.maxDebt + 10;
    const rejected = applyAction(state, { type: "submit" }).state;
    const ticket = ticketInHand(rejected);
    const commits = [...ticket.nodeIds];
    expect(commits.length).toBeGreaterThan(0);

    const restarted = applyAction(rejected, { type: "restart" });
    const fresh = restarted.state.tickets[ticket.id];
    expect(fresh?.nodeIds).toEqual([]);
    expect(fresh?.filled).toBe(0);
    expect(fresh?.rework).toBe(0);
    for (const id of commits) expect(restarted.state.nodes[id]).toBeUndefined();
    expect(eventsOfType(restarted.events, "ticket_restarted")[0]?.nodeIds).toEqual(commits);
    expect(restarted.state.turn).toBe(rejected.turn);
    expect(restarted.state.phase.kind).toBe("choose_action");
  });

  test("carrying on keeps the commits and the fix points", () => {
    const state = makeReady(inHand("pr-resume"));
    state.debt = BALANCE.acceptance.maxDebt + 10;
    const rejected = applyAction(state, { type: "submit" }).state;
    const ticket = ticketInHand(rejected);

    const resumed = applyAction(rejected, { type: "resume" }).state;
    expect(resumed.tickets[ticket.id]?.nodeIds).toEqual(ticket.nodeIds);
    expect(resumed.phase.kind).toBe("choose_action");
    // Still over the ceiling: a second submit is refused again.
    expect(getAvailableActions(resumed).some(isType("submit"))).toBe(true);
  });

  test("a flagged commit blocks the next submit until a fix takes the bug out", () => {
    const state = makeReady(inHand("pr-flagged"));
    const first = plantAiCommit(state);
    const second = plantAiCommit(state);
    for (const id of [first, second]) {
      const node = state.nodes[id];
      if (node !== undefined) node.commit.hiddenBug = true;
    }
    const rejected = applyAction(state, { type: "submit" }).state;
    const ticket = ticketInHand(rejected);
    expect(buggedOn(rejected, ticket)).toEqual([first, second]);

    const resumed = applyAction(rejected, { type: "resume" }).state;
    expect(getAvailableActions(resumed).some(isType("submit"))).toBe(false);
    expect(offersOf(resumed, ticketInHand(resumed))).toContain("fix");

    // The oldest flagged commit is the one a fix redoes.
    let cleaned = resumed;
    for (let i = 0; i < 20 && buggedOn(cleaned, ticketInHand(cleaned)).length === 2; i += 1) {
      const result = applyAction(cleaned, { type: "commit", mode: "craft", kind: "fix" });
      if (result.state.phase.kind === "resolve_conflict") {
        cleaned = applyAction(result.state, { type: "resolve_conflict", how: "manual" }).state;
      } else cleaned = result.state;
      if (buggedOn(cleaned, ticketInHand(cleaned)).length === 1) {
        expect(eventsOfType(result.events, "bug_fixed")[0]?.nodeId).toBe(first);
      }
    }
    expect(buggedOn(cleaned, ticketInHand(cleaned))).toEqual([second]);
    expect(cleaned.nodes[first]?.commit.bugged).toBeUndefined();
  });

  test("a fix is only offered on a flagged commit; a refactor only on one that cost debt", () => {
    const clean = makeReady(inHand("pr-refactor-target"));
    plantCommit(clean, "craft");
    const offers = offersOf(clean, ticketInHand(clean));
    expect(offers).not.toContain("refactor");
    expect(offers).not.toContain("fix");

    // Debt from elsewhere is not this ticket's to refactor.
    const indebted = structuredClone(clean);
    indebted.debt = BALANCE.acceptance.maxDebt + 1;
    expect(offersOf(indebted, ticketInHand(indebted))).not.toContain("refactor");

    const flagged = structuredClone(clean);
    const planted = flagged.nodes[plantAiCommit(flagged)];
    if (planted !== undefined) planted.commit.bugged = true;
    expect(offersOf(flagged, ticketInHand(flagged))).toContain("fix");
    expect(offersOf(flagged, ticketInHand(flagged))).not.toContain("refactor");
    expect(getAvailableActions(flagged).some(isType("submit"))).toBe(false);
  });

  test("a refactor takes back exactly what its most expensive commit cost", () => {
    const state = makeReady(inHand("pr-refactor-cost"));
    const cheap = state.nodes[plantAiCommit(state)];
    const dear = state.nodes[plantAiCommit(state)];
    if (cheap === undefined || dear === undefined) throw new Error("planted commits missing");
    cheap.commit.debt = 4;
    dear.commit.debt = 9;
    state.debt = 20;
    const ticket = ticketInHand(state);
    expect(mostIndebtedOn(state, ticket)).toBe(dear.id);
    expect(offersOf(state, ticket)).toContain("refactor");

    for (let i = 0; i < 20; i += 1) {
      const result = applyAction(state, { type: "commit", mode: "craft", kind: "refactor" });
      const refactored = eventsOfType(result.events, "debt_refactored")[0];
      if (refactored === undefined) continue;
      expect(refactored.nodeId).toBe(dear.id);
      expect(refactored.amount).toBe(9);
      expect(result.state.debt).toBe(11);
      expect(result.state.nodes[dear.id]?.commit.debt).toBeUndefined();
      // The next refactor has the cheaper one left to redo.
      expect(mostIndebtedOn(result.state, ticketInHand(result.state))).toBe(cheap.id);
      return;
    }
    throw new Error("no refactor landed in 20 tries");
  });

  test("a machine-written commit remembers what it cost", () => {
    const state = inHand("pr-cost-memo");
    state.player.docsCharges = 0;
    for (let i = 0; i < 30; i += 1) {
      const result = applyAction(state, { type: "commit", mode: "ai" });
      const done = eventsOfType(result.events, "node_done")[0];
      if (done === undefined || result.state.phase.kind !== "choose_action") continue;
      expect(result.state.nodes[done.nodeId]?.commit.debt).toBe(BALANCE.debt.perAiCommit);
      return;
    }
    throw new Error("no machine commit landed in 30 tries");
  });

  test("a submitted ticket costs a turn; answering a rejection does not", () => {
    const state = makeReady(inHand("pr-turn"));
    state.debt = BALANCE.acceptance.maxDebt + 10;
    const rejected = applyAction(state, { type: "submit" }).state;
    expect(rejected.turn).toBe(state.turn + 1);
    expect(applyAction(rejected, { type: "resume" }).state.turn).toBe(rejected.turn);
  });
});
