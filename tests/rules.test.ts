import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import {
  commitChance,
  debtView,
  gatherEffects,
  isCrunch,
  nodeEnergyCost,
  reviewCleanCount,
  reviewedRatio,
  wipExtra,
} from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";
import { behindOf, offersOf } from "@/game/core/rules/tickets";

import {
  committedAs,
  eventsOfType,
  findSeed,
  inHand,
  isCommit,
  isType,
  makeReady,
  makeReviewable,
  newRun,
  plantAiCommit,
  play,
  policy,
  prefer,
  standingOn,
  ticketInHand,
  withReviewSkill,
  writingACommit,
} from "./helpers";

describe("commit", () => {
  test("the preview's odds are the odds actually rolled", () => {
    for (let i = 0; i < 60; i++) {
      const state = inHand(`preview-${i}`);

      const action = { type: "commit", mode: "ai" } as const;
      const preview = getActionPreview(state, action);
      const rolls = eventsOfType(applyAction(state, action).events, "roll");

      expect(rolls[0]?.chancePct).toBe(preview.successPct ?? -1);
    }
  });

  test("the preview's energy cost is what gets spent", () => {
    // Topped up: energy clamps at zero, and a clamped spend is a different
    // rule from the one under test.
    const state = structuredClone(writingACommit("cost"));
    state.player.energy = state.player.energyMax;

    const action = { type: "commit", mode: "craft" } as const;
    const preview = getActionPreview(state, action);

    // Asserted on what the commit charged, not on the net: a success can also
    // draw an ambient event that hands energy back in the same action.
    const result = applyAction(state, action);
    const charged = eventsOfType(result.events, "energy").find((e) => e.reason === "commit");
    expect(charged?.delta).toBe(-preview.energyCost);
  });

  test("the machine costs one energy whatever it writes", () => {
    const state = inHand("flat");
    expect(nodeEnergyCost(state, "commit", "ai").value).toBe(BALANCE.energy.commitCost.ai);
    expect(nodeEnergyCost(state, "refactor", "ai").value).toBe(BALANCE.energy.commitCost.ai);
    expect(nodeEnergyCost(state, "docs", "ai").value).toBe(BALANCE.energy.commitCost.ai);
    // By hand, a refactor costs what a refactor costs.
    expect(nodeEnergyCost(state, "refactor", "craft").value).toBeGreaterThan(
      nodeEnergyCost(state, "commit", "craft").value,
    );
  });

  test("the machine fills more story points than a hand, and pays in debt", () => {
    const state = inHand("points");
    const craft = getActionPreview(state, { type: "commit", mode: "craft" });
    const ai = getActionPreview(state, { type: "commit", mode: "ai" });

    expect(craft.points).toEqual([BALANCE.points.craft, BALANCE.points.craft]);
    expect(ai.points).toEqual([BALANCE.points.ai, BALANCE.points.ai]);
    expect(ai.points?.[0] ?? 0).toBeGreaterThan(craft.points?.[0] ?? 0);
    expect(craft.debtDelta).toEqual([0, 0]);
    expect(ai.debtDelta?.[0] ?? 0).toBeGreaterThan(0);
  });

  test("a commit that lands fills the ticket by what the preview said", () => {
    const state = inHand("fill");
    state.player.energy = state.player.energyMax;
    const ticket = ticketInHand(state);

    let current = state;
    for (let i = 0; i < 30; i += 1) {
      const result = applyAction(current, { type: "commit", mode: "ai" });
      const landed = eventsOfType(result.events, "points").find((e) => e.ticketId === ticket.id);
      current = result.state;
      if (landed !== undefined && landed.delta > 0) {
        expect(landed.delta).toBe(BALANCE.points.ai);
        return;
      }
    }
    throw new Error("no machine-written commit landed in 30 tries");
  });

  test("a craft commit adds no debt, an AI commit does", () => {
    const craft = findSeed((r) => r.events.some((e) => e.type === "node_done"), {
      prefix: "craft-debt",
      pick: policy("craft"),
      limit: 6,
    });
    expect(craft.state.debt).toBe(0);

    const ai = findSeed(
      (r) => eventsOfType(r.events, "debt").some((e) => e.delta === BALANCE.debt.perAiCommit),
      { prefix: "ai-debt", pick: policy("ai"), limit: 8 },
    );
    expect(ai.state.debt).toBeGreaterThan(0);
  });

  test("Sprint final discounts the machine's debt, in the rules and the preview", () => {
    const state = inHand("discount");
    const skilled = structuredClone(state);
    skilled.skills = ["sprint_final"];

    const plain = getActionPreview(state, { type: "commit", mode: "ai" }).debtDelta?.[0] ?? 0;
    const discounted =
      getActionPreview(skilled, { type: "commit", mode: "ai" }).debtDelta?.[0] ?? 0;
    expect(discounted).toBe(plain - 3);

    const landed = findSeed(
      (r) => eventsOfType(r.events, "debt").some((e) => e.delta === BALANCE.debt.perAiCommit - 3),
      {
        prefix: "discount-real",
        pick: (s, actions) => {
          if (!s.skills.includes("sprint_final")) s.skills.push("sprint_final");
          return policy("ai")(s, actions);
        },
        limit: 8,
      },
    );
    expect(landed.state.debt).toBeGreaterThan(0);
  });

  test("debt makes every roll worse", () => {
    const state = inHand("debt-risk");
    const clean = commitChance(state, "ai", "commit").value;

    const indebted = structuredClone(state);
    indebted.debt = 40;
    const dirty = commitChance(indebted, "ai", "commit").value;

    expect(dirty).toBe(clean - 40 / BALANCE.commit.debtRiskDivisor);
  });

  test("success chance is clamped at both ends", () => {
    const state = inHand("clamp");

    const hopeless = structuredClone(state);
    hopeless.debt = 100;
    hopeless.player.energy = 0;
    expect(commitChance(hopeless, "ai", "commit").value).toBeGreaterThanOrEqual(
      BALANCE.commit.clamp.min,
    );

    const blessed = structuredClone(state);
    blessed.statPoints.luck = 500;
    expect(commitChance(blessed, "craft", "commit").value).toBeLessThanOrEqual(
      BALANCE.commit.clamp.max,
    );
  });

  test("a commit is written one at a time: no burst", () => {
    const { events } = play(inHand("no-burst"), { pick: policy("ai"), limit: 20 });
    const written = eventsOfType(events, "node_done").filter((e) => e.kind === "commit");
    const rolls = eventsOfType(events, "roll").filter((e) => e.action === "commit");
    expect(written.length).toBeLessThanOrEqual(rolls.length);
  });
});

describe("work in progress", () => {
  test("every open ticket beyond the first taxes energy and the roll", () => {
    const one = inHand("wip");
    const two = structuredClone(one);
    const start = getAvailableActions(two).find(isType("start"));
    if (start?.type !== "start") throw new Error("expected a second ticket");
    const both = applyAction(two, start).state;

    expect(wipExtra(one)).toBe(0);
    expect(wipExtra(both)).toBe(1);

    expect(commitChance(both, "craft", "commit").value).toBe(
      commitChance(one, "craft", "commit").value - BALANCE.wip.malusPerExtra,
    );
    expect(nodeEnergyCost(both, "commit", "craft").value).toBe(
      Math.round(nodeEnergyCost(one, "commit", "craft").value * (1 + BALANCE.wip.energyPerExtra)),
    );
  });
});

describe("energy and crunch", () => {
  test("crunch turns on below the threshold and costs points", () => {
    const state = inHand("crunch");

    const rested = structuredClone(state);
    rested.player.energy = BALANCE.energy.crunchThreshold + 1;
    const tired = structuredClone(state);
    tired.player.energy = BALANCE.energy.crunchThreshold;

    expect(isCrunch(rested)).toBe(false);
    expect(isCrunch(tired)).toBe(true);
    expect(commitChance(tired, "craft", "commit").value).toBe(
      commitChance(rested, "craft", "commit").value - BALANCE.energy.crunchMalusPoints,
    );
  });

  test("energy never goes below zero or above the ceiling", () => {
    const { state } = findSeed((r) => r.state.player.energy === 0, {
      prefix: "floor",
      pick: policy("craft"),
      limit: 120,
    });

    expect(state.player.energy).toBe(0);
    expect(state.player.energy).toBeLessThanOrEqual(state.player.energyMax);
  });

  test("burnout needs a second turn at zero, not just the first", () => {
    const spent = structuredClone(writingACommit("burnout"));
    spent.player.energy = 0;
    spent.player.zeroEnergyStreak = 0;

    const once = applyAction(spent, { type: "commit", mode: "craft" }).state;
    expect(once.phase.kind === "game_over" && once.phase.reason === "burnout").toBe(false);
    expect(once.player.energy).toBe(0);
    expect(once.player.zeroEnergyStreak).toBe(1);
  });

  test("a run that burns out says so", () => {
    const { state } = findSeed(
      (r) => r.state.phase.kind === "game_over" && r.state.phase.reason === "burnout",
      { prefix: "bo", pick: prefer(isCommit("craft"), isType("start")), limit: 400 },
    );
    expect(state.phase.kind === "game_over" && state.phase.reason).toBe("burnout");
  });

  test("an accepted ticket hands energy back, costs a turn, and lands on dev with two parents", () => {
    const state = makeReady(inHand("regen"));
    const ticket = ticketInHand(state);
    const result = applyAction(state, { type: "submit" });

    expect(eventsOfType(result.events, "pr_reviewed")[0]?.accepted).toBe(true);
    if (result.state.phase.kind === "resolve_conflict") return;

    const regen = eventsOfType(result.events, "energy").filter((e) => e.reason === "merge_regen");
    expect(regen[0]?.delta).toBeGreaterThan(0);
    expect(result.state.turn).toBe(state.turn + 1);

    const merged = result.state.tickets[ticket.id];
    expect(merged?.status).toBe("merged");
    const node =
      merged?.mergeNodeId === undefined ? undefined : result.state.nodes[merged.mergeNodeId];
    expect(node?.kind).toBe("feature_merge");
    expect(node?.lane).toBe(1);
    expect(node?.parents.length).toBe(2);
    expect(result.state.devMerges).toBe(state.devMerges + 1);
    expect(result.state.ticketsDelivered).toBe(state.ticketsDelivered + 1);
    expect(result.state.xpEarned).toBeGreaterThan(state.xpEarned);
  });
});

describe("debt visibility", () => {
  test("by default the player sees a band, not a number", () => {
    const state = newRun("fuzzy");
    state.debt = 40;
    const view = debtView(state);

    expect(view.exact).toBeNull();
    expect(view.range[0]).toBeLessThanOrEqual(40);
    expect(view.range[1]).toBeGreaterThanOrEqual(40);
  });

  test("a linter reveals the exact figure", () => {
    const state = newRun("exact");
    state.debt = 37;
    state.skills = ["linter"];

    const view = debtView(state, gatherEffects(state));
    expect(view.exact).toBe(37);
  });

  test("the Vibe Coder's band is wider than everyone else's", () => {
    const junior = newRun("vibe-a", "junior");
    const vibe = newRun("vibe-b", "vibe_coder");
    junior.debt = 50;
    vibe.debt = 50;
    junior.debtNoise = 0;
    vibe.debtNoise = 0;

    const juniorView = debtView(junior, gatherEffects(junior));
    const vibeView = debtView(vibe, gatherEffects(vibe));
    expect(vibeView.range[1] - vibeView.range[0]).toBeGreaterThan(
      juniorView.range[1] - juniorView.range[0],
    );
  });

  test("the band is clamped to the real scale", () => {
    const state = newRun("clamped");
    state.debt = 0;
    expect(debtView(state).range[0]).toBeGreaterThanOrEqual(0);

    state.debt = BALANCE.debt.max;
    expect(debtView(state).range[1]).toBeLessThanOrEqual(BALANCE.debt.max);
  });

  test("the band only moves when the debt does", () => {
    const state = inHand("stable-noise");

    // A craft commit carries no debt of its own. Unless an event intervened,
    // the band has to be exactly where it was: re-rolling the noise on a turn
    // that changed nothing would make the number look alive when it is not.
    const result = applyAction(state, { type: "commit", mode: "craft" });
    if (result.state.debt !== state.debt) return;

    expect(result.state.debtNoise).toBe(state.debtNoise);
  });
});

describe("review", () => {
  test("reading back recent AI work repays debt", () => {
    const state = makeReviewable(inHand("review-debt"));
    state.debt = 20;

    const after = applyAction(state, { type: "review" }).state;
    expect(after.debt).toBeLessThan(state.debt);
  });

  test("a review marks the commits it read, on the ticket in hand", () => {
    const state = makeReviewable(inHand("review-mark"));
    plantAiCommit(state);
    expect(reviewedRatio(state)).toBeLessThan(1);

    const after = applyAction(state, { type: "review" }).state;
    expect(reviewedRatio(after)).toBeGreaterThan(reviewedRatio(state));
    const reviewed = eventsOfType(applyAction(state, { type: "review" }).events, "reviewed")[0];
    expect(reviewed?.nodeIds.length).toBe(2);
  });

  test("reviewing fresh work reads more of it", () => {
    const state = newRun("chain");
    const cold = structuredClone(state);
    cold.player.aiChain = 0;
    const hot = structuredClone(state);
    hot.player.aiChain = BALANCE.review.chainLength;

    expect(reviewCleanCount(hot)).toBe(reviewCleanCount(cold) + BALANCE.review.chainBonus);
  });

  test("a review with nothing to read is not offered at all", () => {
    const state = withReviewSkill(inHand("nothing"));
    expect(getAvailableActions(state).some(isType("review"))).toBe(false);
  });

  test("review has to be learned before it is offered", () => {
    const state = inHand("unlearned");
    state.skills = [];
    plantAiCommit(state);
    expect(getAvailableActions(state).some(isType("review"))).toBe(false);

    state.skills = ["code_review"];
    expect(getAvailableActions(state).some(isType("review"))).toBe(true);
  });

  test("a review still costs a turn, which is what makes it a decision", () => {
    const state = makeReviewable(inHand("review-turn"));
    const after = applyAction(state, { type: "review" }).state;
    expect(after.turn).toBe(state.turn + 1);
  });

  test("a review costs the energy the preview advertised", () => {
    const state = makeReviewable(inHand("review-energy"));
    const cost = getActionPreview(state, { type: "review" }).energyCost;
    expect(cost).toBeGreaterThan(0);

    const after = applyAction(state, { type: "review" }).state;
    expect(state.player.energy - after.player.energy).toBe(cost);
  });

  test("pair programming makes a review cheaper, in the rules and not only in the preview", () => {
    const state = makeReviewable(inHand("review-cheap"));
    const cheap = structuredClone(state);
    cheap.skills = ["pair_programming"];

    const plain = applyAction(state, { type: "review" }).state;
    const discounted = applyAction(cheap, { type: "review" }).state;

    expect(state.player.energy - plain.player.energy).toBeGreaterThan(
      cheap.player.energy - discounted.player.energy,
    );
  });

  test("the automatic review is free, and reads what has already shipped", () => {
    const state = makeReviewable(inHand("free-review"));
    const automated = structuredClone(state);
    automated.devops.review_bot = 1;
    automated.player.turnsSinceFreeReview = BALANCE.review.botCadence - 1;
    // Something shipped unread, which only the automatic review can reach.
    const shippedId = plantAiCommit(automated);
    ticketInHand(automated).nodeIds.pop();
    automated.shipped.push(shippedId);

    const result = applyAction(automated, { type: "commit", mode: "craft" });
    const free = eventsOfType(result.events, "reviewed").filter((event) => event.free);
    expect(free.length).toBe(1);
    expect(free[0]?.nodeIds).toContain(shippedId);

    const spentOnReview = eventsOfType(result.events, "energy").filter(
      (event) => event.reason === "review",
    );
    expect(spentOnReview).toEqual([]);
  });
});

describe("free actions", () => {
  test("starting a ticket does not take a turn", () => {
    const state = newRun("free-start");
    const start = getAvailableActions(state).find(isType("start"));
    if (start?.type !== "start") throw new Error("expected a start");

    const after = applyAction(state, start).state;
    expect(after.turn).toBe(state.turn);
    expect(getActionPreview(state, start).consumesTurn).toBe(false);
  });

  test("placing a DevOps point does not either", () => {
    const state = inHand("free-devops");
    const rich = structuredClone(state);
    rich.devopsPoints = 3;

    const after = applyAction(rich, { type: "devops", id: "ci" }).state;
    expect(after.turn).toBe(rich.turn);
    expect(after.devops.ci).toBe(1);
    expect(after.devopsPoints).toBe(2);
  });

  test("CI makes every roll better", () => {
    const state = inHand("ci");
    const withCi = structuredClone(state);
    withCi.devops.ci = 2;

    expect(commitChance(withCi, "ai", "commit").value).toBe(
      commitChance(state, "ai", "commit").value + 10,
    );
  });

  test("CD makes a merge a bigger rest", () => {
    const state = inHand("cd");
    const automated = structuredClone(state);
    automated.devops.cd = 1;

    expect(gatherEffects(automated).mergeRegenBonus).toBeGreaterThan(
      gatherEffects(state).mergeRegenBonus,
    );
  });
});

describe("squash", () => {
  test("erases machine-written commits, their debt and their score", () => {
    const { before, after, events } = committedAs("squash");

    const squashed = eventsOfType(events, "squashed")[0];
    expect(squashed).toBeDefined();
    if (squashed === undefined) return;

    expect(squashed.nodeIds.length).toBeGreaterThanOrEqual(BALANCE.squash.minUnread);
    expect(squashed.debtDelta).toBeLessThan(0);
    expect(after.debt).toBeLessThan(before.debt);
    // The commits are gone from the history, so they are gone from the count.
    // The squash commit is itself a commit, so the count moves by one up and
    // `commitsLost` down: everything the fold swallowed beyond the one it kept.
    expect(squashed.commitsLost).toBe(squashed.nodeIds.length - BALANCE.squash.keptCommits);
    expect(after.player.totalCommits).toBe(before.player.totalCommits + 1 - squashed.commitsLost);
  });

  test("is only offered with something to squash, and needs no review skill", () => {
    const state = inHand("squash-gate");
    state.skills = [];
    expect(offersOf(state, ticketInHand(state))).not.toContain("squash");

    for (let i = 0; i < BALANCE.squash.minUnread; i += 1) plantAiCommit(state);
    expect(offersOf(state, ticketInHand(state))).toContain("squash");
    expect(getAvailableActions(state).some(isType("review"))).toBe(false);
  });
});

describe("documentation", () => {
  test("buys the next machine-written commits out of their debt", () => {
    const { after: written } = committedAs("docs");
    expect(written.player.docsCharges).toBe(BALANCE.docs.charges);

    const after = play(written, { pick: prefer(isCommit("ai")), limit: 6 });

    // Every machine-written commit in that window was covered. Total debt is
    // not the assertion — a failure event can move it for reasons of its own.
    const machineWritten = eventsOfType(after.events, "node_done").filter(
      (event) => event.mode === "ai",
    );
    expect(machineWritten.length).toBeGreaterThan(0);

    const covered = Math.min(BALANCE.docs.charges, machineWritten.length);
    expect(eventsOfType(after.events, "docs_used").length).toBe(covered);
    expect(after.state.player.docsCharges).toBe(BALANCE.docs.charges - covered);
  });

  test("the preview stops advertising a debt it will not charge", () => {
    const { after: written } = committedAs("docs");
    const preview = getActionPreview(written, { type: "commit", mode: "ai" });
    expect(preview.debtDelta).toEqual([0, 0]);
  });
});

describe("rebase", () => {
  test("is offered only once dev has moved under the ticket", () => {
    const state = inHand("rebase-gate");
    const ticket = ticketInHand(state);
    expect(behindOf(state, ticket)).toBe(0);
    expect(offersOf(state, ticket)).not.toContain("rebase");

    state.devMerges += 1;
    expect(behindOf(state, ticket)).toBe(1);
    expect(offersOf(state, ticket)).toContain("rebase");
  });

  test("a clean history rebases far better than a dirty one", () => {
    const state = standingOn("rebase");

    const clean = structuredClone(state);
    clean.debt = 0;
    const dirty = structuredClone(state);
    dirty.debt = 60;

    const cleanChance = commitChance(clean, "craft", "rebase").value;
    const dirtyChance = commitChance(dirty, "craft", "rebase").value;

    expect(cleanChance).toBeGreaterThan(dirtyChance + 20);
  });

  test("landing it erases the lag, so the merge no longer pays for it", () => {
    const { before, after, events } = committedAs("rebase");
    const ticket = ticketInHand(before);
    expect(behindOf(before, ticket)).toBeGreaterThan(0);

    expect(eventsOfType(events, "rebased").length).toBe(1);
    const rebased = after.tickets[ticket.id];
    expect(rebased).toBeDefined();
    if (rebased === undefined) return;
    expect(behindOf(after, rebased)).toBe(0);
  });
});
