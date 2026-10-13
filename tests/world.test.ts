import { describe, expect, test } from "bun:test";

import { WORLD_EVENT_IDS } from "@/game/content";
import { CREW_BALANCE } from "@/game/core/balance";
import { createRun } from "@/game/core/run";
import {
  cardOf,
  createWorld,
  rankCompanies,
  stepWorld,
  withCard,
  withoutCompany,
  worldInputFor,
} from "@/game/core/world";
import { SAVE_VERSION } from "@/game/dto/version";

function card(id: string, power: number, score: number, alive = true) {
  return { id, name: id, power, score, alive };
}

function run(world = createWorld("w"), rounds = 2000) {
  const events: string[] = [];
  let state = world;
  for (let i = 0; i < rounds; i += 1) {
    const step = stepWorld(state);
    state = step.world;
    if (step.event !== undefined) events.push(`${state.round}:${step.event}`);
  }
  return { world: state, events };
}

describe("the world", () => {
  test("is deterministic from its seed", () => {
    expect(run().events).toEqual(run().events);
    expect(run(createWorld("other")).events).not.toEqual(run().events);
  });

  test("an event falls now and then, never twice within the cooldown", () => {
    const { events } = run();
    expect(events.length).toBeGreaterThan(10);
    const rounds = events.map((entry) => Number(entry.split(":")[0]));
    for (let i = 1; i < rounds.length; i += 1) {
      expect((rounds[i] ?? 0) - (rounds[i - 1] ?? 0)).toBeGreaterThanOrEqual(
        CREW_BALANCE.world.eventCooldownRounds,
      );
    }
    for (const entry of events) {
      expect(WORLD_EVENT_IDS).toContain(entry.split(":")[1] as never);
    }
  });

  test("draws the same whoever is standing", () => {
    const empty = createWorld("w");
    const crowded = withCard(withCard(empty, card("a", 1, 1)), card("b", 2, 2));
    expect(run(crowded, 500).events).toEqual(run(empty, 500).events);
  });

  test("a company's rivals are the others standing, weakest first", () => {
    let world = createWorld("w");
    world = withCard(world, card("z", 50, 1));
    world = withCard(world, card("a", 300, 1));
    world = withCard(world, card("m", 120, 1));
    world = withCard(world, card("dead", 9999, 1, false));
    expect(worldInputFor(world, "m").rivals).toEqual([50, 300]);
    expect(worldInputFor(world, "m", "audit")).toEqual({ rivals: [50, 300], event: "audit" });
  });

  test("ranks by score, ties to the older id; a company that leaves is gone", () => {
    let world = createWorld("w");
    world = withCard(world, card("b", 1, 10));
    world = withCard(world, card("a", 1, 10));
    world = withCard(world, card("c", 1, 30));
    expect(rankCompanies(world).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(rankCompanies(withoutCompany(world, "c")).map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("reads a card off a company's state", () => {
    const state = createRun({
      seed: "w",
      mode: "multiplayer",
      profileId: "junior",
      version: SAVE_VERSION,
      crew: { name: "Acme", founder: "Ada" },
    });
    const read = cardOf("c1", state);
    expect(read).toMatchObject({ id: "c1", name: "Acme", alive: true });
    expect(read.power).toBeGreaterThanOrEqual(0);
  });
});
