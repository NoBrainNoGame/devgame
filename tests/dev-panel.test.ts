import { describe, expect, test } from "bun:test";

import { rebuildRun } from "@/game/bridge/rebuild";
import { BALANCE } from "@/game/core/balance";
import { getAvailableActions, isActionAvailable } from "@/game/core/rules/actions";
import { devSheet } from "@/game/core/rules/dev";
import { applyAction } from "@/game/core/rules/reducer";
import { tierOf } from "@/game/core/rules/tier";
import { hashState } from "@/game/core/run";
import type { PlayerAction } from "@/game/core/types";
import { editedByDev, replayRun } from "@/game/dto/replay";
import { PlayerActionSchema } from "@/game/dto/run";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

import { inHand, newRun, play, policy, ticketInHand } from "./helpers";

const devSet = (values: Extract<PlayerAction, { type: "dev_set" }>["values"]): PlayerAction => ({
  type: "dev_set",
  values,
});

describe("dev_set", () => {
  test("is legal while the run is on, and never offered", () => {
    const state = newRun("dev-legal");
    expect(isActionAvailable(state, devSet({ money: 1 }))).toBe(true);
    expect(getAvailableActions(state).some((action) => action.type === "dev_set")).toBe(false);

    const over = applyAction(state, devSet({ quality: BALANCE.quality.max })).state;
    expect(over.phase.kind).toBe("game_over");
    expect(isActionAvailable(over, devSet({ money: 1 }))).toBe(false);
  });

  test("writes the values, costs no turn and says nothing", () => {
    const state = inHand("dev-write");
    const ticket = ticketInHand(state);
    const { state: next, events } = applyAction(
      state,
      devSet({ money: 12_345, skillPoints: 7, xp: 99, debt: 30, energy: 10, filled: 999 }),
    );

    expect(next.money).toBe(12_345);
    expect(next.skillPoints).toBe(7);
    expect(next.xpEarned).toBe(99);
    expect(next.debt).toBe(30);
    expect(next.player.energy).toBe(10);
    // Clamped to what the ticket holds.
    expect(next.tickets[ticket.id]?.filled).toBe(ticket.points);
    expect(next.turn).toBe(state.turn);
    expect(events).toEqual([]);
    // The caller's state is never touched.
    expect(state.money).toBe(BALANCE.economy.startingMoney);
  });

  test("raises the tier with the earnings, and lets a tier be asked for outright", () => {
    const earned = BALANCE.economy.tier.first * BALANCE.economy.tier.growth * 3;
    const raised = applyAction(newRun("dev-tier"), devSet({ earned })).state;
    expect(raised.moneyEarned).toBe(earned);
    expect(raised.tier).toBe(tierOf(earned));

    const lowered = applyAction(raised, devSet({ tier: 0 })).state;
    expect(lowered.tier).toBe(0);
  });

  test("follows the ceilings the levels move, and staffs a site", () => {
    const state = newRun("dev-levels");
    const next = applyAction(
      state,
      devSet({ tree: { stamina: 99 }, upgrades: { coworking: 1 }, energy: 999 }),
    ).state;

    expect(next.tree.stamina).toBe(5);
    expect(next.upgrades.coworking).toBe(1);
    expect(next.player.energyMax).toBeGreaterThan(state.player.energyMax);
    expect(next.player.energy).toBe(next.player.energyMax);
    expect(next.devs).toHaveLength(state.devs.length + 1);
    expect(devSheet(next).max.energy).toBe(next.player.energyMax);
  });

  test("replays in the browser, identically", () => {
    const options = { seed: "dev-replay", mode: "classic" as const, profileId: "junior" as const };
    const live = play(newRun(options.seed), { pick: policy("ai"), limit: 20 });
    const actions = [...live.actions, devSet({ money: 5_000, energy: 1 })];
    let state = live.state;
    state = applyAction(state, devSet({ money: 5_000, energy: 1 })).state;

    const rebuilt = rebuildRun({ ...options, version: SAVE_VERSION }, actions);
    expect(rebuilt.replayed).toHaveLength(actions.length);
    expect(hashState(rebuilt.state)).toBe(hashState(state));
  });
});

describe("a save the dev panel touched", () => {
  const save = (actions: PlayerAction[]) => ({
    version: SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    seed: "dev-save",
    mode: "classic" as const,
    profileId: "junior" as const,
    unlockedSkills: newRun("dev-save").unlockedSkills,
    startingSkillPoints: 0,
    actions,
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-09-27T10:00:00.000Z",
  });

  test("is never replayed on the server", () => {
    const edited = save([devSet({ money: 1_000_000 })]);
    expect(editedByDev(edited)).toBe(true);
    const outcome = replayRun(edited);
    expect(outcome.valid).toBe(false);

    expect(editedByDev(save([]))).toBe(false);
    expect(replayRun(save([])).valid).toBe(true);
  });

  test("crosses the schema bounded", () => {
    const parse = (values: unknown) =>
      PlayerActionSchema.safeParse({ type: "dev_set", values }).success;
    expect(parse({ money: 10, upgrades: { coworking: 1 }, tree: { stamina: 2 } })).toBe(true);
    expect(parse({ money: -1 })).toBe(false);
    expect(parse({ money: 1.5 })).toBe(false);
    expect(parse({ upgrades: { death_star_2: 1 } })).toBe(false);
    expect(parse({ score: 1_000_000 })).toBe(false);
  });
});
