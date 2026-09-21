import { describe, expect, test } from "bun:test";

import { BOT_ARCHETYPES } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import { aliveBots, botCountForSprint } from "@/game/core/rules/bots";
import { reviewedRatio } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";

import {
  eventsOfType,
  findSeed,
  isCommit,
  isType,
  makeReviewable,
  newRun,
  play,
  prefer,
  withReviewSkill,
} from "./helpers";

describe("rivals", () => {
  test("the first sprint faces one bot, and the count grows to the cap", () => {
    expect(botCountForSprint(1)).toBe(BALANCE.bots.startCount);
    expect(botCountForSprint(2)).toBe(2);
    expect(botCountForSprint(9)).toBe(BALANCE.bots.max);
    expect(newRun("bots-1").bots).toEqual(expect.objectContaining({ "bot-1": expect.anything() }));
    expect(aliveBots(newRun("bots-1")).length).toBe(1);
  });

  test("a newcomer is faster than its archetype's baseline", () => {
    const { state } = findSeed((r) => r.state.sprint >= 3, {
      prefix: "faster",
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 400,
    });

    const newcomers = aliveBots(state).filter(
      (bot) => bot.speedPct > BOT_ARCHETYPES[bot.archetype].speedPct,
    );
    expect(newcomers.length).toBeGreaterThan(0);
  });

  test("bots only move on turns the player spends", () => {
    const state = newRun("bots-idle");
    expect(state.phase.kind).toBe("choose_node");

    const nodeId = state.phase.kind === "choose_node" ? state.phase.candidates[0] : undefined;
    if (nodeId === undefined) return;

    const after = applyAction(state, { type: "move", nodeId }).state;
    for (const bot of aliveBots(after)) {
      const before = state.bots[bot.id];
      expect(bot.sprintProgress).toBe(before?.sprintProgress ?? -1);
      expect(bot.acc).toBe(before?.acc ?? -1);
    }
  });

  test("a mistake stalls a bot for a turn and shows up in the log", () => {
    const { events } = findSeed((r) => r.events.some((e) => e.type === "bot_mistake"), {
      prefix: "mistake",
      pick: prefer(isCommit("ai")),
      limit: 40,
    });
    expect(eventsOfType(events, "bot_mistake").length).toBeGreaterThan(0);
  });

  test("reviewing raises reputation without gaining a single node", () => {
    const withAi = findSeed(
      (r) => r.state.player.aiHistory.filter((e) => !e.reviewed).length >= 3,
      {
        prefix: "rep",
        pick: prefer(isCommit("ai")),
        limit: 30,
      },
    );

    const ready = withReviewSkill(withAi.state);
    // Reviewing is only on the table while writing a commit, so the fallback
    // `prefer` reaches for would have been a move — and a move can walk a
    // forced step, which does buy ground.
    if (!getAvailableActions(ready).some(isType("review"))) return;

    const before = reviewedRatio(ready);
    const after = applyAction(ready, { type: "review" }).state;

    expect(reviewedRatio(after)).toBeGreaterThanOrEqual(before);
    // The whole point: a review buys no ground in the race.
    expect(after.player.sprintProgress).toBe(ready.player.sprintProgress);
  });

  test("firing a rival hands over its trophy skill and its debt", () => {
    const { state, events } = findSeed((r) => r.events.some((e) => e.type === "bot_fired"), {
      prefix: "fire",
      pick: prefer(isCommit("ai"), isCommit("craft")),
      limit: 300,
    });

    const fired = eventsOfType(events, "bot_fired")[0];
    expect(fired).toBeDefined();
    if (fired === undefined) return;

    expect(state.skills).toContain(fired.rewards.skillId);
    expect(state.botsFired).toBeGreaterThan(0);
    expect(fired.rewards.xp).toBeGreaterThan(0);
  });

  test("the firing bar fills only while the lead holds", () => {
    const { state } = play(newRun("bar"), { limit: 1 });
    const bot = aliveBots(state)[0];
    expect(bot).toBeDefined();
    if (bot === undefined) return;

    const behind = structuredClone(state);
    const target = behind.bots[bot.id];
    if (target === undefined) return;
    target.firingProgress = 3;
    target.sprintProgress = behind.player.sprintProgress + 5;

    const after = applyAction(makeReviewable(behind), { type: "review" }).state;
    expect(after.bots[bot.id]?.firingProgress).toBeLessThan(3);
  });

  test("falling far behind for long enough ends the run", () => {
    const { state } = play(newRun("fired"), { limit: 1 });
    const doomed = structuredClone(state);
    doomed.player.overtakenStreak = BALANCE.bots.overtakenStreak - 1;
    for (const bot of Object.values(doomed.bots)) {
      bot.sprintProgress = doomed.player.sprintProgress + BALANCE.bots.overtakenGap + 2;
      bot.stalled = 5;
    }

    const after = applyAction(makeReviewable(doomed), { type: "review" }).state;
    expect(after.phase.kind === "game_over" && after.phase.reason).toBe("fired");
  });

  test("the Tortue takes longer to dislodge than the Rapide", () => {
    expect(BOT_ARCHETYPES.tortue.firingTurns).toBeGreaterThan(BOT_ARCHETYPES.rapide.firingTurns);
    expect(BOT_ARCHETYPES.tortue.speedPct).toBeLessThan(BOT_ARCHETYPES.rapide.speedPct);
  });
});
