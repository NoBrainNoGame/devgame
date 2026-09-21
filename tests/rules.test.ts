import { describe, expect, test } from "bun:test";

import { BALANCE } from "@/game/core/balance";
import { mainLineIndexOf } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import {
  commitChance,
  debtView,
  gatherEffects,
  isCrunch,
  reviewCleanCount,
  reviewedRatio,
} from "@/game/core/rules/modifiers";
import { getActionPreview } from "@/game/core/rules/preview";
import { applyAction } from "@/game/core/rules/reducer";

import {
  committedOn,
  eventsOfType,
  findSeed,
  isCommit,
  isType,
  makeReviewable,
  newRun,
  play,
  prefer,
  standingOn,
  withReviewSkill,
} from "./helpers";

describe("commit", () => {
  test("the preview's odds are the odds actually rolled", () => {
    for (let i = 0; i < 60; i++) {
      const { state } = play(newRun(`preview-${i}`), { limit: 1 });
      if (state.phase.kind !== "choose_action") continue;

      const action = { type: "commit", mode: "ai" } as const;
      const preview = getActionPreview(state, action);
      const rolls = eventsOfType(applyAction(state, action).events, "roll");

      expect(rolls[0]?.chancePct).toBe(preview.successPct ?? -1);
    }
  });

  test("the preview's energy cost is what gets spent", () => {
    const { state } = play(newRun("cost"), { limit: 1 });
    const action = { type: "commit", mode: "craft" } as const;
    const preview = getActionPreview(state, action);

    const after = applyAction(state, action).state;
    expect(state.player.energy - after.player.energy).toBe(preview.energyCost);
  });

  test("a craft commit adds no debt, an AI commit does", () => {
    // The Rapide bot pushes its own mess onto shared `main`, so the only fair
    // comparison is a stretch of turns where it did not make a mistake.
    const craft = findSeed(
      (r) =>
        r.events.some((e) => e.type === "node_done") &&
        !r.events.some((e) => e.type === "bot_mistake"),
      { prefix: "craft-debt", pick: prefer(isCommit("craft")), limit: 4 },
    );
    expect(craft.state.debt).toBe(0);

    // Asserted on the emitted delta, not the total: a detour on the way can
    // repay some of it in the same handful of turns.
    const ai = findSeed(
      (r) => eventsOfType(r.events, "debt").some((e) => e.delta === BALANCE.debt.perAiCommit),
      { prefix: "ai-debt", pick: prefer(isCommit("ai")), limit: 6 },
    );
    expect(ai.state.debt).toBeGreaterThan(0);
  });

  test("debt makes every roll worse", () => {
    const { state } = play(newRun("debt-risk"), { limit: 1 });
    const node = state.nodes[state.player.nodeId];
    expect(node).toBeDefined();
    if (node === undefined) return;

    const clean = commitChance(state, "ai", node).value;

    const indebted = structuredClone(state);
    indebted.debt = 40;
    const dirty = commitChance(indebted, "ai", node).value;

    expect(dirty).toBe(clean - 40 / BALANCE.commit.debtRiskDivisor);
  });

  test("success chance is clamped at both ends", () => {
    const { state } = play(newRun("clamp"), { limit: 1 });
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) return;

    const hopeless = structuredClone(state);
    hopeless.debt = 100;
    hopeless.player.energy = 0;
    expect(commitChance(hopeless, "ai", node).value).toBeGreaterThanOrEqual(
      BALANCE.commit.clamp.min,
    );

    const blessed = structuredClone(state);
    blessed.statPoints.luck = 500;
    expect(commitChance(blessed, "craft", node).value).toBeLessThanOrEqual(
      BALANCE.commit.clamp.max,
    );
  });

  test("an AI burst walks further than one node", () => {
    const { events } = findSeed((r) => r.events.some((e) => e.type === "ai_jumped"), {
      prefix: "jump",
      pick: prefer(isCommit("ai")),
      limit: 20,
    });

    const jumps = eventsOfType(events, "ai_jumped");
    expect(jumps.length).toBeGreaterThan(0);
    expect(jumps[0]?.nodeIds.length).toBeGreaterThan(0);
  });

  test("an AI burst stops rather than walking through a decision", () => {
    const { state, events } = findSeed((r) => r.events.some((e) => e.type === "ai_jumped"), {
      prefix: "jump-stop",
      pick: prefer(isCommit("ai")),
      limit: 20,
    });

    for (const jump of eventsOfType(events, "ai_jumped")) {
      for (const id of jump.nodeIds) {
        const node = state.nodes[id];
        expect(node?.kind).not.toBe("fork");
        expect(node?.kind).not.toBe("feature_merge");
        expect(node?.kind).not.toBe("release");
      }
    }
  });
});

describe("energy and crunch", () => {
  test("crunch turns on below the threshold and costs points", () => {
    const { state } = play(newRun("crunch"), { limit: 1 });
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) return;

    const rested = structuredClone(state);
    rested.player.energy = BALANCE.energy.crunchThreshold + 1;
    const tired = structuredClone(state);
    tired.player.energy = BALANCE.energy.crunchThreshold;

    expect(isCrunch(rested)).toBe(false);
    expect(isCrunch(tired)).toBe(true);
    expect(commitChance(tired, "craft", node).value).toBe(
      commitChance(rested, "craft", node).value - BALANCE.energy.crunchMalusPoints,
    );
  });

  test("energy never goes below zero or above the ceiling", () => {
    const { state } = findSeed((r) => r.state.player.energy === 0, {
      prefix: "floor",
      pick: prefer(isCommit("craft")),
      limit: 120,
    });

    expect(state.player.energy).toBe(0);
    expect(state.player.energy).toBeLessThanOrEqual(state.player.energyMax);
  });

  test("burnout needs a second turn at zero, not just the first", () => {
    const { state } = play(newRun("burnout"), { limit: 1 });
    const spent = structuredClone(state);
    spent.player.energy = 0;
    spent.player.zeroEnergyStreak = 0;

    const once = applyAction(spent, { type: "commit", mode: "craft" }).state;
    expect(once.phase.kind === "game_over" && once.phase.reason === "burnout").toBe(false);
    expect(once.player.zeroEnergyStreak).toBe(1);
  });

  test("a run that burns out says so", () => {
    const { state } = findSeed(
      (r) => r.state.phase.kind === "game_over" && r.state.phase.reason === "burnout",
      { prefix: "bo", pick: prefer(isCommit("craft")), limit: 400 },
    );
    expect(state.phase.kind === "game_over" && state.phase.reason).toBe("burnout");
  });

  test("a merge hands energy back", () => {
    const { events } = findSeed((r) => r.events.some((e) => e.type === "branch_merged"), {
      prefix: "regen",
      pick: prefer(isCommit("ai")),
      limit: 60,
    });

    const regen = eventsOfType(events, "energy").filter((e) => e.reason === "merge_regen");
    expect(regen.length).toBeGreaterThan(0);
    expect(regen[0]?.delta).toBeGreaterThan(0);
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
    const { state } = findSeed((r) => r.state.phase.kind === "choose_action", {
      prefix: "stable-noise",
      limit: 1,
    });

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
    const withDebt = findSeed((r) => r.state.debt >= BALANCE.debt.perAiCommit, {
      prefix: "review-debt",
      pick: prefer(isCommit("ai")),
      limit: 10,
    });

    const before = withDebt.state.debt;
    const reviewed = play(withReviewSkill(withDebt.state), {
      pick: prefer(isType("review")),
      limit: 3,
    });
    expect(reviewed.state.debt).toBeLessThan(before);
  });

  test("a review marks the commits it read", () => {
    const withAi = findSeed((r) => r.state.player.aiHistory.length >= 2, {
      prefix: "review-mark",
      pick: prefer(isCommit("ai")),
      limit: 10,
    });

    const after = play(withReviewSkill(withAi.state), {
      pick: prefer(isType("review")),
      limit: 2,
    }).state;
    expect(reviewedRatio(after)).toBeGreaterThan(reviewedRatio(withAi.state));
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
    const { state } = play(newRun("nothing"), { limit: 1 });
    state.skills = ["code_review"];
    state.player.aiHistory = [];

    expect(getAvailableActions(state).some(isType("review"))).toBe(false);
  });

  test("review has to be learned before it is offered", () => {
    const { state } = play(newRun("unlearned"), { limit: 1 });
    state.skills = [];
    state.player.aiHistory = [{ nodeId: state.player.nodeId, reviewed: false }];
    expect(getAvailableActions(state).some(isType("review"))).toBe(false);

    state.skills = ["code_review"];
    expect(getAvailableActions(state).some(isType("review"))).toBe(true);
  });

  test("a review still costs a turn, which is what makes it a decision", () => {
    const state = makeReviewable(play(newRun("review-turn"), { limit: 1 }).state);
    const after = applyAction(state, { type: "review" }).state;
    expect(after.turn).toBe(state.turn + 1);
  });

  test("a review costs the energy the preview advertised", () => {
    const state = makeReviewable(play(newRun("review-energy"), { limit: 1 }).state);
    const cost = getActionPreview(state, { type: "review" }).energyCost;
    expect(cost).toBeGreaterThan(0);

    const after = applyAction(state, { type: "review" }).state;
    expect(state.player.energy - after.player.energy).toBe(cost);
  });

  test("pair programming makes a review cheaper, in the rules and not only in the preview", () => {
    const state = makeReviewable(play(newRun("review-cheap"), { limit: 1 }).state);
    const cheap = structuredClone(state);
    cheap.skills = ["pair_programming"];

    const plain = applyAction(state, { type: "review" }).state;
    const discounted = applyAction(cheap, { type: "review" }).state;

    expect(state.player.energy - plain.player.energy).toBeGreaterThan(
      cheap.player.energy - discounted.player.energy,
    );
  });

  test("the automatic review a DevOps bot performs is free", () => {
    const withAi = findSeed(
      (r) =>
        r.state.phase.kind === "choose_action" &&
        r.state.player.aiHistory.filter((e) => !e.reviewed).length >= 2,
      {
        prefix: "free-review",
        pick: prefer(isCommit("ai")),
        limit: 20,
        stop: (state) =>
          state.phase.kind === "choose_action" &&
          state.player.aiHistory.filter((e) => !e.reviewed).length >= 2,
      },
    );

    const automated = structuredClone(withAi.state);
    automated.devops.review_bot = 1;
    automated.player.turnsSinceFreeReview = BALANCE.review.botCadence - 1;

    const result = applyAction(automated, { type: "commit", mode: "ai" });
    const free = eventsOfType(result.events, "reviewed").filter((event) => event.free);
    if (free.length === 0) return;

    const spentOnReview = eventsOfType(result.events, "energy").filter(
      (event) => event.reason === "review",
    );
    expect(spentOnReview).toEqual([]);
  });
});

describe("free actions", () => {
  test("walking the graph does not hand the rivals a turn", () => {
    const state = newRun("free-move");
    expect(state.phase.kind).toBe("choose_node");

    const move = state.phase.kind === "choose_node" ? state.phase.candidates[0] : undefined;
    expect(move).toBeDefined();
    if (move === undefined) return;

    const after = applyAction(state, { type: "move", nodeId: move }).state;
    expect(after.turn).toBe(state.turn);
    expect(getActionPreview(state, { type: "move", nodeId: move }).botsAdvance).toBe(false);
  });

  test("placing a DevOps point does not either", () => {
    const { state } = play(newRun("free-devops"), { limit: 1 });
    const rich = structuredClone(state);
    rich.devopsPoints = 3;

    const after = applyAction(rich, { type: "devops", id: "ci" }).state;
    expect(after.turn).toBe(rich.turn);
    expect(after.devops.ci).toBe(1);
    expect(after.devopsPoints).toBe(2);
  });

  test("CI makes every roll better", () => {
    const { state } = play(newRun("ci"), { limit: 1 });
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) return;

    const withCi = structuredClone(state);
    withCi.devops.ci = 2;

    expect(commitChance(withCi, "ai", node).value).toBe(commitChance(state, "ai", node).value + 10);
  });

  test("CD makes a merge a bigger rest", () => {
    const { state } = play(newRun("cd"), { limit: 1 });
    const merge = Object.values(state.nodes).find((node) => node.kind === "feature_merge");
    expect(merge).toBeDefined();
    if (merge === undefined) return;

    const automated = structuredClone(state);
    automated.devops.cd = 1;

    // CD used to make merges cost nothing. Every feature now ends in a merge,
    // so a free one made energy a resource that only ever went up: it pays
    // back more instead.
    expect(gatherEffects(automated).mergeRegenBonus).toBeGreaterThan(
      gatherEffects(state).mergeRegenBonus,
    );
  });
});

describe("the race", () => {
  test("the race position never runs ahead of the trunk", () => {
    for (let i = 0; i < 40; i += 1) {
      const { state } = play(newRun(`race-${i}`), { pick: prefer(isCommit("ai")), limit: 60 });
      const node = state.nodes[state.player.nodeId];
      if (node === undefined || state.phase.kind === "game_over") continue;

      // The player holds the same number a rival holds: an index into this
      // sprint's main line. It may be lower — a rejected PR docks it — but it
      // can never claim ground further up the trunk than the player stands on.
      expect(state.player.sprintProgress).toBeLessThanOrEqual(mainLineIndexOf(state, node));
    }
  });

  test("a machine-written burst banks the nodes, not the ground", () => {
    const start = newRun("burst");
    let state = start;

    for (let i = 0; i < 200; i += 1) {
      if (state.phase.kind === "game_over") break;
      const legal = getAvailableActions(state);
      const action = legal.find(isCommit("ai")) ?? legal[0];
      if (action === undefined) break;

      const beforePosition = state.player.sprintProgress;
      const beforeCommits = state.player.totalCommits;
      const result = applyAction(state, action);
      state = result.state;

      const jumped = eventsOfType(result.events, "ai_jumped")[0];
      if (jumped === undefined || jumped.nodeIds.length === 0) continue;

      const nodes = state.player.totalCommits - beforeCommits;
      const ground = state.player.sprintProgress - beforePosition;

      // Every node resolved is a commit; only the ones that moved the trunk
      // are ground taken off a rival.
      expect(nodes).toBeGreaterThan(0);
      expect(ground).toBeLessThanOrEqual(nodes);
      return;
    }

    throw new Error("no machine-written burst happened in 200 actions");
  });
});

describe("squash", () => {
  test("erases machine-written commits, their debt and their score", () => {
    const { before, after, events } = committedOn("squash", {
      where: (state) => state.player.aiHistory.filter((entry) => !entry.reviewed).length >= 2,
    });

    const squashed = eventsOfType(events, "squashed")[0];
    expect(squashed).toBeDefined();
    if (squashed === undefined) return;

    expect(squashed.nodeIds.length).toBeGreaterThan(0);
    expect(squashed.debtDelta).toBeLessThan(0);
    expect(after.debt).toBeLessThan(before.debt);
    // The commits are gone from the history, so they are gone from the count.
    // The squash node is itself a commit, so the count moves by one up and
    // `commitsLost` down: everything the fold swallowed beyond the one it kept.
    expect(squashed.commitsLost).toBe(squashed.nodeIds.length - BALANCE.squash.keptCommits);
    expect(after.player.totalCommits).toBe(before.player.totalCommits + 1 - squashed.commitsLost);
  });

  test("works without ever having learned to review", () => {
    // Neither route to review: not the Code review branch, not Pair
    // programming, which grants the same habit under another name.
    const { before, events } = committedOn("squash", {
      prefix: "squash-unlearned",
      where: (state) => !gatherEffects(state).canReview,
    });
    expect(getAvailableActions(before).some(isType("review"))).toBe(false);
    expect(eventsOfType(events, "squashed").length).toBe(1);
  });
});

describe("documentation", () => {
  test("buys the next machine-written commits out of their debt", () => {
    const { after: written } = committedOn("docs");
    expect(written.player.docsCharges).toBe(BALANCE.docs.charges);

    // Free steps off the detour, then whatever machine-written work comes next.
    // A detour lands back on the feature, so it can take a couple of moves.
    const after = play(written, { pick: prefer(isCommit("ai")), limit: 6 });

    // Every machine-written node in that window was covered. Total debt is not
    // the assertion — a failure event can move it for reasons of its own.
    const machineWritten = eventsOfType(after.events, "node_done").filter(
      (event) => event.mode === "ai",
    );
    expect(machineWritten.length).toBeGreaterThan(0);
    expect(eventsOfType(after.events, "docs_used").length).toBe(machineWritten.length);
    expect(after.state.player.docsCharges).toBe(BALANCE.docs.charges - machineWritten.length);
  });

  test("the preview stops advertising a debt it will not charge", () => {
    const { after: written } = committedOn("docs");

    const moved = play(written, { limit: 1 }).state;
    const preview = getActionPreview(moved, { type: "commit", mode: "ai" });
    expect(preview.debtDelta).toEqual([0, 0]);
  });
});

describe("rebase", () => {
  test("a clean history rebases far better than a dirty one", () => {
    const state = standingOn("rebase");
    const node = state.nodes[state.player.nodeId];
    if (node === undefined) throw new Error("expected a node");

    const clean = structuredClone(state);
    clean.debt = 0;
    const dirty = structuredClone(state);
    dirty.debt = 60;

    const cleanChance = commitChance(clean, "craft", node).value;
    const dirtyChance = commitChance(dirty, "craft", node).value;

    expect(cleanChance).toBeGreaterThan(dirtyChance + 20);
  });

  test("landing it carries the next commit for free", () => {
    const { after, events } = committedOn("rebase");
    const carried = eventsOfType(events, "rebased")[0];
    expect(carried).toBeDefined();
    if (carried === undefined) return;

    expect(carried.nodeIds.length).toBe(BALANCE.rebase.carry);
    // Carried by hand, not by the machine: a replay adds no debt of its own.
    for (const id of carried.nodeIds) {
      expect(after.nodes[id]?.commit?.mode).toBe("craft");
    }
  });
});
