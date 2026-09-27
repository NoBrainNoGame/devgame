import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import {
  buggedOn,
  mostIndebtedOn,
  offersOf,
  openTickets,
  waitsOnlyForHealth,
} from "@/game/core/rules/tickets";

import {
  eventsOfType,
  inHand,
  isType,
  makeReady,
  makeRefusable,
  plantAiCommit,
  plantCommit,
  submitAndMerge,
  ticketInHand,
} from "./helpers";

describe("the pull request review", () => {
  test("clean work is accepted, and lands once the merge is pressed", () => {
    const state = makeReady(inHand("pr-clean"));
    const result = submitAndMerge(state);

    const review = eventsOfType(result.events, "pr_reviewed")[0];
    expect(review?.accepted).toBe(true);
    expect(review?.bugs).toBe(0);
    if (result.state.phase.kind === "resolve_conflict") return;
    expect(result.state.tickets[ticketInHand(state).id]?.status).toBe("merged");
    // One turn for the pair, not two.
    expect(result.state.turn).toBe(state.turn + 1);
  });

  test("under the health floor no pull request opens, and a refactor opens it again", () => {
    const state = makeReady(inHand("pr-debt"));
    const planted = state.nodes[plantAiCommit(state)];
    if (planted === undefined) throw new Error("planted commit missing");
    planted.commit.reviewed = true;
    planted.commit.debt = BALANCE.debt.perAiCommit;
    state.debt = BALANCE.acceptance.maxDebt + 1;
    const ticket = ticketInHand(state);

    expect(getAvailableActions(state).some(isType("submit"))).toBe(false);
    expect(waitsOnlyForHealth(state, ticket)).toBe(true);
    expect(offersOf(state, ticket)).toContain("refactor");

    for (let i = 0; i < 20; i += 1) {
      const result = applyAction(state, { type: "commit", mode: "craft", kind: "refactor" });
      if (eventsOfType(result.events, "debt_refactored").length === 0) continue;
      expect(result.state.debt).toBeLessThanOrEqual(BALANCE.acceptance.maxDebt);
      expect(getAvailableActions(result.state).some(isType("submit"))).toBe(true);
      return;
    }
    throw new Error("no refactor landed in 20 tries");
  });

  test("a hotfix, a debt ticket and a forced refactor open under the floor", () => {
    for (const kind of ["hotfix", "debt", "refactor"] as const) {
      const state = makeReady(inHand(`pr-debt-${kind}`));
      ticketInHand(state).kind = kind;
      state.debt = BALANCE.acceptance.maxDebt + 25;
      expect(getAvailableActions(state).some(isType("submit"))).toBe(true);
    }
  });

  test("a blameless culture takes a refusal without losing patience", () => {
    const state = makeRefusable(inHand("pr-blameless"));
    const refused = applyAction(state, { type: "submit" }).state;
    expect(refused.quality).toBe(state.quality + BALANCE.quality.perRejection);

    const blameless = makeRefusable(inHand("pr-blameless"));
    blameless.relics = [...blameless.relics, "blameless"];
    const forgiven = applyAction(blameless, { type: "submit" }).state;
    expect(forgiven.phase.kind).toBe("ticket_rejected");
    expect(forgiven.quality).toBe(blameless.quality);
  });

  test("a showcase's pull request opens whatever the health", () => {
    const state = makeReady(inHand("pr-debt-showcase"));
    state.showcase = { backlog: 0 };
    state.debt = BALANCE.acceptance.maxDebt + 10;
    expect(getAvailableActions(state).some(isType("submit"))).toBe(true);
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

  test("a refusal that fills production's gauge is the sack, not a question", () => {
    let seen = false;
    for (let i = 0; i < 30 && !seen; i += 1) {
      const state = makeReady(inHand(`pr-sack-${i}`));
      for (let n = 0; n < 4; n += 1) plantAiCommit(state);
      state.quality = BALANCE.quality.max - BALANCE.quality.perRejection;

      const result = applyAction(state, { type: "submit" });
      const review = eventsOfType(result.events, "pr_reviewed")[0];
      if (review === undefined || review.accepted) continue;
      seen = true;

      expect(result.state.phase).toEqual({
        kind: "game_over",
        reason: "fired",
        cause: "rejection",
      });
      expect(getAvailableActions(result.state)).toEqual([]);
    }
    expect(seen).toBe(true);
  });

  test("a hotfix whose commit the review flagged can still be fixed", () => {
    const state = makeReady(inHand("hotfix-fix"));
    const ticket = ticketInHand(state);
    ticket.kind = "hotfix";
    ticket.mustWrite = "hotfix";
    const bugged = plantAiCommit(state);
    const node = state.nodes[bugged];
    if (node !== undefined) node.commit.bugged = true;

    expect(offersOf(state, ticket)).toEqual(["fix"]);
    expect(getAvailableActions(state).some((a) => a.type === "submit")).toBe(false);

    const fixed = applyAction(state, { type: "commit", mode: "craft", kind: "fix" }).state;
    const after = fixed.tickets[ticket.id];
    if (after === undefined) throw new Error("ticket vanished");
    const rolled = fixed.nodes[after.nodeIds[after.nodeIds.length - 1] ?? ""];
    // The roll may have missed; when it landed, the bug is gone and the
    // ticket can go back to review.
    if (rolled?.kind === "fix") {
      expect(buggedOn(fixed, after)).toEqual([]);
      expect(getAvailableActions(fixed).some((a) => a.type === "submit")).toBe(true);
    }
  });

  test("shipping a refused ticket anyway opens a dated follow-up per bug, and the bug ships", () => {
    const state = makeRefusable(inHand("pr-followup"));
    const rejected = applyAction(state, { type: "submit" }).state;
    const ticket = ticketInHand(rejected);
    const bugged = buggedOn(rejected, ticket);
    expect(bugged.length).toBe(1);

    const shipped = applyAction(rejected, { type: "followup" });
    expect(shipped.state.phase).toEqual({ kind: "pr_accepted", ticketId: ticket.id });
    // The fix points come off again; the commit stays flagged for the release.
    expect(shipped.state.tickets[ticket.id]?.points).toBe(ticket.points - ticket.rework);
    expect(shipped.state.nodes[bugged[0] ?? ""]?.commit.bugged).toBe(true);
    const followups = eventsOfType(shipped.events, "followup")[0]?.ticketIds ?? [];
    expect(followups.length).toBe(1);
    const followup = shipped.state.tickets[followups[0] ?? ""];
    expect(followup?.kind).toBe("client_bug");
    expect(followup?.status).toBe("backlog");
    expect(followup?.fixesNodeId).toBe(bugged[0]);
    expect(followup?.deadlineSprint).toBeDefined();
    expect(shipped.state.stats.followups).toBe(1);
  });

  test("fixing keeps the commits, writes the first fix, and the points stay", () => {
    const state = makeRefusable(inHand("pr-resume"));
    const rejected = applyAction(state, { type: "submit" }).state;
    const ticket = ticketInHand(rejected);

    const { state: resumed, events } = applyAction(rejected, { type: "resume" });
    const after = resumed.tickets[ticket.id];
    // The commits stay, and the first fix is written on top when its roll lands.
    expect(after?.nodeIds.slice(0, ticket.nodeIds.length)).toEqual(ticket.nodeIds);
    expect(resumed.phase.kind).toBe("choose_action");
    // The caught bug's fix point is on the ticket; a fix that missed leaves
    // the bug flagged, so no submit until one lands.
    expect(after?.points).toBe(ticket.points);
    const landed = eventsOfType(events, "bug_fixed").length === 1;
    expect(after?.nodeIds.length).toBe(ticket.nodeIds.length + (landed ? 1 : 0));
    expect(buggedOn(resumed, ticketInHand(resumed)).length).toBe(landed ? 0 : 1);
    expect(getAvailableActions(resumed).some(isType("submit"))).toBe(landed);
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
    for (let i = 0; i < 30; i += 1) {
      // A fresh seed each try: the same state rolls the same dice.
      const state = inHand(`pr-cost-memo-${i}`);
      state.player.docsCharges = 0;
      const result = applyAction(state, { type: "commit", mode: "ai" });
      const done = eventsOfType(result.events, "node_done")[0];
      if (done === undefined || result.state.phase.kind !== "choose_action") continue;
      expect(result.state.nodes[done.nodeId]?.commit.debt).toBe(BALANCE.debt.perAiCommit);
      return;
    }
    throw new Error("no machine commit landed in 30 tries");
  });

  test("a refusal costs nothing; fixing it costs the turn, shipping it pays at the merge", () => {
    const state = makeRefusable(inHand("pr-turn"));
    const rejected = applyAction(state, { type: "submit" }).state;
    expect(rejected.turn).toBe(state.turn);
    const fixed = applyAction(rejected, { type: "resume" });
    expect(fixed.state.turn).toBe(rejected.turn + 1);
    // The turn is the first fix's: written by hand, at once.
    const roll = eventsOfType(fixed.events, "roll")[0];
    expect(roll?.action).toBe("commit");
    if (roll?.success) {
      expect(eventsOfType(fixed.events, "node_done")[0]?.kind).toBe("fix");
      expect(eventsOfType(fixed.events, "bug_fixed").length).toBe(1);
    }
    expect(applyAction(rejected, { type: "followup" }).state.turn).toBe(rejected.turn);
  });
});
