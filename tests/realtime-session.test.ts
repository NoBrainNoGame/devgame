import { describe, expect, test } from "bun:test";

import { GameSession } from "@/game/bridge/session";
import { gameStore, resetGameStore } from "@/game/bridge/store";
import { getAvailableActions } from "@/game/core/rules/actions";
import type { PlayerAction } from "@/game/core/types";
import { emptyMeta } from "@/game/dto/meta";
import type { AppliedEntryDto, ServerMessage } from "@/game/dto/realtime";
import { EntryDriver, type EntrySink } from "@/realtime/client/driver";
import { createRealtimeStore } from "@/realtime/client/store";
import type { Out } from "@/realtime/world";
import { RealtimeWorld } from "@/realtime/world";

const ada = { profileId: "p-ada", name: "Ada" };
const bob = { profileId: "p-bob", name: "Bob" };

function worldWithTwo() {
  let n = 0;
  const world = new RealtimeWorld({
    now: () => 0,
    newId: () => {
      n += 1;
      return `c${n}`;
    },
    seed: "session",
  });
  world.start(30_000);
  const stream: ServerMessage[] = [];
  const keep = (outs: Out[]): void => {
    for (const out of outs)
      if ("profile" in out.to && out.to.profile === ada.profileId) stream.push(out.message);
    for (const out of outs) {
      if (
        "company" in out.to &&
        world.audience(out.to.company, out.to.except).includes(ada.profileId)
      ) {
        stream.push(out.message);
      }
    }
  };
  keep(world.createCompany(ada, "Acme"));
  keep(world.joinCompany(bob, "c1"));
  return { world, stream, keep };
}

function joinedOf(stream: ServerMessage[]) {
  const found = stream.find((m) => m.type === "company.joined");
  if (found?.type !== "company.joined") throw new Error("no join");
  return found;
}

function sessionFor(
  world: RealtimeWorld,
  seat: number,
  site: string,
  sent: PlayerAction[] = [],
): GameSession {
  resetGameStore();
  const joined = worldStream(world);
  return new GameSession({
    seed: "ignored",
    mode: "classic",
    profileId: "junior",
    meta: emptyMeta("2026-10-13T10:00:00.000Z"),
    clientRunId: "11111111-2222-4333-8444-555555555555",
    createdAt: "2026-10-13T10:00:00.000Z",
    seat,
    company: {
      start: joined.start as never,
      site,
      entries: joined.entries.map((row) => row.entry),
      send: (action) => {
        sent.push(action);
        return { ok: true };
      },
    },
  });
}

describe("a company's session", () => {
  test("sending is not applying: nothing moves until the echo comes back", () => {
    const { world } = worldWithTwo();
    const sent: PlayerAction[] = [];
    const session = sessionFor(world, 0, "hq", sent);
    const before = session.hash();
    const start = getAvailableActions(session.getRawState(), 0).find((a) => a.type === "start");
    if (start === undefined) throw new Error("no start");
    expect(session.dispatch(start)).toEqual({ ok: true });
    expect(sent).toEqual([start]);
    expect(session.hash()).toBe(before);
    expect(session.dispatch({ type: "merge" })).toEqual({ ok: false, reason: "illegal" });
    expect(() => session.save()).toThrow(/no local save/);
  });

  test("two browsers fed the same entries hold the server's state, hash for hash", () => {
    const { world, keep } = worldWithTwo();
    const adaSession = sessionFor(world, 0, "hq");
    const bobSession = sessionFor(world, 1, "hq");

    const rows: AppliedEntryDto[] = [];
    const record = (outs: Out[]): void => {
      for (const out of outs) {
        const m = out.message;
        if ("profile" in out.to && out.to.profile !== ada.profileId) continue;
        if (m.type === "entry.applied" || m.type === "round.resolved") {
          rows.push({ seq: m.seq, entry: m.entry, hash: m.hash });
        }
        if (m.type === "company.joined" && out.to && "profile" in out.to) {
          for (const row of m.entries) if (!rows.some((r) => r.seq === row.seq)) rows.push(row);
        }
      }
    };

    // Both were built from the company as it stood: the join is already in them.
    const joinRow = worldStream(world).entries;

    for (const profile of [ada, bob]) {
      const seat = profile === ada ? 0 : 1;
      const state = world.stateOf("c1");
      if (state === undefined) throw new Error("no state");
      const start = getAvailableActions(state, seat).find((a) => a.type === "start");
      if (start === undefined) throw new Error("no start");
      record(world.act(profile.profileId, start));
    }
    world.roundAct(ada.profileId, 0, { type: "commit", mode: "craft" });
    world.roundAct(bob.profileId, 0, { type: "commit", mode: "ai" });
    for (let i = 0; i < 6; i += 1) {
      const outs = world.tick(60_000 + i);
      record(outs);
      keep(outs);
    }

    for (const row of rows.filter((r) => r.seq > joinRow.length).sort((a, b) => a.seq - b.seq)) {
      expect(adaSession.applyEntry(row.entry)).toBe(true);
      expect(adaSession.hash()).toBe(row.hash);
      expect(bobSession.applyEntry(row.entry)).toBe(true);
      expect(bobSession.hash()).toBe(row.hash);
    }
    expect(adaSession.hash()).toBe(world.hashOf("c1") ?? "?");
    expect(bobSession.hash()).toBe(world.hashOf("c1") ?? "?");
  });

  test("the driver feeds a real session from the store and notices a refused entry", () => {
    const { world } = worldWithTwo();
    const session = sessionFor(world, 0, "hq");
    const store = createRealtimeStore();
    const desyncs: [number, string][] = [];
    const sink: EntrySink = {
      applyEntry: (row) => session.applyEntry(row.entry),
      hash: () => session.hash(),
      busy: () => gameStore.getState().pendingAnimation,
      skip: () => gameStore.setState({ pendingAnimation: false }),
    };
    session.setPresentation({ animated: false });
    const driver = new EntryDriver({
      store,
      sink,
      onDesync: (seq, hash) => desyncs.push([seq, hash]),
    });

    const joined = worldStream(world);
    store.getState().dispatch({ type: "server", message: joined, receivedAt: 0 });
    expect(session.hash()).toBe(world.hashOf("c1") ?? "?");

    // An entry that makes no sense to the rules is a drift, not a crash.
    store.getState().dispatch({
      type: "server",
      message: {
        type: "entry.applied",
        seq: joined.entries.length + 1,
        hash: "00000000",
        entry: { kind: "act", seat: 5, action: { type: "buy_point" } },
      },
      receivedAt: 0,
    });
    driver.drain();
    expect(desyncs).toHaveLength(1);
  });

  test("the scene is given the viewer's site, the HUD the viewer's board", () => {
    const { world } = worldWithTwo();
    const session = sessionFor(world, 0, "hq");
    expect(session.getState()).toBe(session.getState());
    expect(session.isCompany).toBe(true);
    expect(gameStore.getState().snapshot?.crew).toBeDefined();
  });
});

/** Everything Ada would have been told: her join, then nothing else yet. */
function worldStream(world: RealtimeWorld): Extract<ServerMessage, { type: "company.joined" }> {
  const outs = world.connect(ada);
  const found = outs.map((o) => o.message).find((m) => m.type === "company.joined");
  if (found?.type !== "company.joined") throw new Error("no join");
  return found;
}
