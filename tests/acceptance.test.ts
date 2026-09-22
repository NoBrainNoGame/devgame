import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { openTickets } from "@/game/core/rules/tickets";

import { eventsOfType, inHand, isType, makeReady, plantAiCommit, ticketInHand } from "./helpers";

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

  test("a submitted ticket costs a turn; answering a rejection does not", () => {
    const state = makeReady(inHand("pr-turn"));
    state.debt = BALANCE.acceptance.maxDebt + 10;
    const rejected = applyAction(state, { type: "submit" }).state;
    expect(rejected.turn).toBe(state.turn + 1);
    expect(applyAction(rejected, { type: "resume" }).state.turn).toBe(rejected.turn);
  });
});
