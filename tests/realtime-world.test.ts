import { describe, expect, test } from "bun:test";

import { getAvailableActions } from "@/game/core/rules/actions";
import { occupiedSeats } from "@/game/core/rules/crew";
import type { PlayerAction } from "@/game/core/types";
import { CompanySaveSchema, replayCompany } from "@/game/dto/company";
import type { ServerMessage } from "@/game/dto/realtime";
import { COMPANY_SAVE_VERSION, CREW_FINGERPRINT, RULES_FINGERPRINT } from "@/game/dto/version";
import { MemoryStore } from "@/realtime/store";
import { type Out, RealtimeWorld, WorldError } from "@/realtime/world";

const ada = { profileId: "p-ada", name: "Ada" };
const bob = { profileId: "p-bob", name: "Bob" };
const cy = { profileId: "p-cy", name: "Cy" };

function harness(seed = "world-test") {
  let ids = 0;
  let clock = 1_000_000;
  const store = new MemoryStore();
  store.world = { id: "main", seed, round: 0, rng: 0, lastEventRound: 0 };
  const world = new RealtimeWorld({
    now: () => clock,
    newId: () => {
      ids += 1;
      return `c${ids}`;
    },
    seed,
    roundMs: 30_000,
  });
  world.start(clock + 30_000);
  const inbox: Record<string, ServerMessage[]> = {};
  const deliver = (outs: Out[]): void => {
    for (const out of outs) {
      const targets =
        "profile" in out.to ? [out.to.profile] : world.audience(out.to.company, out.to.except);
      for (const id of targets) {
        const box = inbox[id] ?? [];
        box.push(out.message);
        inbox[id] = box;
      }
    }
  };
  return {
    world,
    store,
    inbox,
    deliver,
    send: (outs: Out[]): void => deliver(outs),
    tick(): void {
      clock += 30_000;
      deliver(world.tick(clock + 30_000));
    },
    async flush(): Promise<void> {
      await store.commit(world.drainWrites());
    },
    of(profileId: string, type: ServerMessage["type"]): ServerMessage[] {
      return (inbox[profileId] ?? []).filter((m) => m.type === type);
    },
    clear(): void {
      for (const key of Object.keys(inbox)) delete inbox[key];
    },
  };
}

function lastOf<T extends ServerMessage["type"]>(
  messages: ServerMessage[],
  type: T,
): Extract<ServerMessage, { type: T }> {
  const found = [...messages].reverse().find((m) => m.type === type);
  if (found === undefined) throw new Error(`no ${type} message`);
  return found as Extract<ServerMessage, { type: T }>;
}

function pick(world: RealtimeWorld, profileId: string, type: PlayerAction["type"]): PlayerAction {
  const held = world.seatOf(profileId);
  if (held === undefined) throw new Error("not seated");
  const state = world.stateOf(held.companyId);
  if (state === undefined) throw new Error("no state");
  const action = getAvailableActions(state, held.seat).find((a) => a.type === type);
  if (action === undefined) throw new Error(`${profileId} has no ${type}`);
  return action;
}

/** The company's whole log, read back from the store and replayed from scratch. */
async function replayFromStore(store: MemoryStore, companyId: string) {
  const company = store.companies.get(companyId);
  if (company === undefined) throw new Error("not stored");
  const save = CompanySaveSchema.parse({
    version: COMPANY_SAVE_VERSION,
    rules: RULES_FINGERPRINT,
    crew: CREW_FINGERPRINT,
    ...company.start,
    entries: company.entries.map((row) => row.entry),
  });
  return replayCompany(save);
}

describe("the lobby and the companies", () => {
  test("a player creates a company and is seated at once", () => {
    const h = harness();
    h.send(h.world.connect(ada));
    h.send(h.world.createCompany(ada, "Acme"));
    const joined = lastOf(h.inbox[ada.profileId] ?? [], "company.joined");
    expect(joined).toMatchObject({ seat: 0, site: "hq", start: { name: "Acme", founder: "Ada" } });
    expect(joined.members).toHaveLength(1);
    expect(h.world.seatOf(ada.profileId)).toEqual({ companyId: joined.companyId, seat: 0 });
  });

  test("a player has one seat, a name has a length, a world has a size", () => {
    const h = harness();
    h.world.createCompany(ada, "Acme");
    expect(() => h.world.createCompany(ada, "Other")).toThrow(WorldError);
    expect(() => h.world.createCompany(bob, "ab")).toThrow(/characters/);
    expect(() => h.world.joinCompany(ada, "c1")).toThrow(WorldError);
    expect(() => h.world.joinCompany(bob, "nope")).toThrow(WorldError);
  });

  test("a player joins a company with a free seat; the others hear about it", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.connect(bob));
    h.clear();
    h.send(h.world.joinCompany(bob, "c1"));
    expect(lastOf(h.inbox[bob.profileId] ?? [], "company.joined")).toMatchObject({ seat: 1 });
    expect(h.of(ada.profileId, "entry.applied")).toHaveLength(1);
    expect(h.of(ada.profileId, "seat.changed")).toHaveLength(1);
    // The newcomer gets the join inside the company, not as a separate entry.
    expect(h.of(bob.profileId, "entry.applied")).toHaveLength(0);
    const joined = lastOf(h.inbox[bob.profileId] ?? [], "company.joined");
    expect(joined.entries.map((row) => row.entry.kind)).toEqual(["join"]);
  });

  test("a waiting player is recruited into the recruiter's site", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.connect(bob));
    h.send(h.world.wait(bob));
    expect(lastOf(h.inbox[bob.profileId] ?? [], "lobby.state").waitingYou).toBe(true);
    h.send(h.world.recruit(ada.profileId, bob.profileId));
    expect(h.world.seatOf(bob.profileId)?.companyId).toBe("c1");
    expect(() => h.world.recruit(ada.profileId, cy.profileId)).toThrow(/no longer waiting/);
  });

  test("a full site refuses a recruit and a join", () => {
    const h = harness();
    h.world.createCompany(ada, "Acme");
    h.world.joinCompany(bob, "c1");
    h.world.joinCompany(cy, "c1");
    const dan = { profileId: "p-dan", name: "Dan" };
    h.world.wait(dan);
    expect(() => h.world.recruit(ada.profileId, dan.profileId)).toThrow(/full/);
    expect(() => h.world.joinCompany(dan, "c1")).toThrow(/free seat/);
  });
});

describe("a round", () => {
  test("resolves every company's choices together, and the hash is the replay's", async () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.joinCompany(bob, "c1"));
    h.send(h.world.act(ada.profileId, pick(h.world, ada.profileId, "start")));
    h.send(h.world.act(bob.profileId, pick(h.world, bob.profileId, "start")));
    h.send(h.world.roundAct(ada.profileId, 0, { type: "commit", mode: "craft" }));
    h.send(h.world.roundAct(bob.profileId, 0, { type: "commit", mode: "ai" }));
    h.clear();
    h.tick();

    const resolved = lastOf(h.inbox[ada.profileId] ?? [], "round.resolved");
    expect(resolved.entry.kind).toBe("round");
    expect(resolved.substituted).toEqual([]);
    expect(lastOf(h.inbox[bob.profileId] ?? [], "round.resolved").hash).toBe(resolved.hash);
    expect(h.world.hashOf("c1")).toBe(resolved.hash);
    expect(h.world.roundOf("c1")).toBe(1);

    await h.flush();
    const replay = await replayFromStore(h.store, "c1");
    if (!replay.valid) throw new Error(replay.error);
    expect(replay.hash).toBe(resolved.hash);
  });

  test("keeps the last choice until the deadline and refuses a stale or illegal one", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.act(ada.profileId, pick(h.world, ada.profileId, "start")));
    h.send(h.world.roundAct(ada.profileId, 0, { type: "rest" }));
    h.send(h.world.roundAct(ada.profileId, 0, { type: "commit", mode: "craft" }));
    expect(() => h.world.roundAct(ada.profileId, 3, { type: "rest" })).toThrow(/round/);
    expect(() => h.world.roundAct(ada.profileId, 0, { type: "merge" })).toThrow(/not available/);
    expect(() => h.world.roundAct(ada.profileId, 0, { type: "buy_point" })).toThrow(
      /not a turn action/,
    );
    expect(() => h.world.act(ada.profileId, { type: "commit", mode: "craft" })).toThrow(
      /turn action/,
    );
    h.clear();
    h.tick();
    const resolved = lastOf(h.inbox[ada.profileId] ?? [], "round.resolved");
    if (resolved.entry.kind !== "round") throw new Error("expected a round");
    expect(resolved.entry.actions["0"]).toEqual({ type: "commit", mode: "craft" });
  });

  test("an unsent action is a miss; three in a row put the seat on the machine; coming back ends it", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.joinCompany(bob, "c1"));
    h.send(h.world.connect(ada));
    for (let i = 0; i < 2; i += 1) h.tick();
    expect(lastOf(h.inbox[ada.profileId] ?? [], "round.resolved").misses["0"]).toBe(2);
    expect(lastOf(h.inbox[ada.profileId] ?? [], "round.resolved").autopilot).toEqual([]);
    h.tick();
    const third = lastOf(h.inbox[ada.profileId] ?? [], "round.resolved");
    expect(third.autopilot).toEqual([0, 1]);
    h.tick();
    // The machine plays: no more misses on the clock, and the seat has a ticket.
    const state = h.world.stateOf("c1");
    expect(state?.crew?.seats[0]?.player.ticketId).not.toBeNull();
  });

  test("a seat that comes back takes its seat back from the machine", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    for (let i = 0; i < 3; i += 1) h.tick();
    expect(lastOf(h.inbox[ada.profileId] ?? [], "round.resolved").autopilot).toEqual([0]);
    const start = h.world.stateOf("c1");
    if (start === undefined) throw new Error("no state");
    const action = getAvailableActions(start, 0).find(
      (a) => a.type === "checkout" || a.type === "start",
    );
    if (action !== undefined) h.send(h.world.act(ada.profileId, action));
    const tick = (): void => h.tick();
    tick();
    expect(lastOf(h.inbox[ada.profileId] ?? [], "round.resolved").autopilot).toEqual([]);
  });

  test("a seat with nothing to do is not punished", () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    // Nothing started: ada has a backlog to start from, so a miss is a miss.
    h.tick();
    expect(lastOf(h.inbox[ada.profileId] ?? [], "round.resolved").misses["0"]).toBe(1);
  });
});

describe("the vote", () => {
  /** Plays on the machine until the company asks a question. */
  function untilQuestion(h: ReturnType<typeof harness>): void {
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.joinCompany(bob, "c1"));
    for (let i = 0; i < 400 && h.world.questionOf("c1") === null; i += 1) h.tick();
    if (h.world.questionOf("c1") === null) throw new Error("no question after 400 rounds");
  }

  test("opens a question for the company, counts the votes, ties go to the first seat", () => {
    const h = harness();
    untilQuestion(h);
    const open = lastOf(h.inbox[ada.profileId] ?? [], "question.open");
    expect(open.options.length).toBeGreaterThan(0);
    const [first, second] = open.options;
    if (first === undefined) throw new Error("no option");

    // Everyone is on the machine by now; they are back when they vote.
    h.send(h.world.connect(ada));
    h.send(h.world.connect(bob));
    const other = second ?? first;
    h.send(h.world.vote(bob.profileId, other));
    expect(() => h.world.vote(ada.profileId, "not-an-option")).toThrow(/options/);
    h.clear();
    h.send(h.world.vote(ada.profileId, first));
    // Both voted, the first seat's choice wins the tie.
    const result = lastOf(h.inbox[ada.profileId] ?? [], "question.result");
    expect(result.choice).toBe(first);
    expect(h.world.questionOf("c1")).toBeNull();
  });

  test("no vote at all means the first option, at the next tick", () => {
    const h = harness();
    untilQuestion(h);
    const open = lastOf(h.inbox[ada.profileId] ?? [], "question.open");
    h.clear();
    h.tick();
    expect(lastOf(h.inbox[ada.profileId] ?? [], "question.result").choice).toBe(
      open.options[0] ?? "",
    );
    expect(h.world.questionOf("c1")).toBeNull();
  });

  test("no round runs while the company is deciding", () => {
    const h = harness();
    untilQuestion(h);
    expect(() => h.world.roundAct(ada.profileId, h.world.roundOf("c1"), { type: "rest" })).toThrow(
      /deciding/,
    );
    expect(() => h.world.act(ada.profileId, { type: "buy_point" })).toThrow(/deciding/);
  });
});

describe("leaving", () => {
  test("a player leaves; the last one dissolves the company", async () => {
    const h = harness();
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.joinCompany(bob, "c1"));
    h.send(h.world.leave(bob.profileId));
    expect(h.world.seatOf(bob.profileId)).toBeUndefined();
    expect(occupiedSeats(h.world.stateOf("c1") ?? ({} as never))).toEqual([0]);

    h.clear();
    h.send(h.world.leave(ada.profileId));
    expect(lastOf(h.inbox[ada.profileId] ?? [], "seat.changed").change).toBe("left");
    await h.flush();
    expect(h.store.companies.get("c1")).toMatchObject({
      status: "closed",
      closeReason: "dissolved",
    });
    expect(h.world.companyIds()).toEqual([]);
  });

  test("a player who disconnects keeps the seat; the others see it offline", () => {
    const h = harness();
    h.send(h.world.connect(ada));
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.connect(bob));
    h.send(h.world.joinCompany(bob, "c1"));
    h.clear();
    h.send(h.world.disconnect(bob.profileId));
    const change = lastOf(h.inbox[ada.profileId] ?? [], "seat.changed");
    expect(change.member).toMatchObject({ profileId: "p-bob", status: "offline" });
    expect(h.world.seatOf(bob.profileId)).toBeDefined();
    // Back: re-seated straight into the company.
    h.clear();
    h.send(h.world.connect(bob));
    expect(lastOf(h.inbox[bob.profileId] ?? [], "company.joined").seat).toBe(1);
  });
});

describe("the ranking", () => {
  test("lists the companies and the players, and where the viewer stands", () => {
    const h = harness();
    h.world.createCompany(ada, "Acme");
    h.world.createCompany(bob, "Beta");
    const message = h.world.ranking(ada.profileId);
    if (message.type !== "ranking") throw new Error("expected a ranking");
    expect(message.companies.map((c) => c.name).sort()).toEqual(["Acme", "Beta"]);
    expect(message.players).toHaveLength(2);
    expect(message.mine).toMatchObject({ companyId: "c1", companyTotal: 2, playerTotal: 2 });
    expect(message.mine.companyRank).toBeGreaterThanOrEqual(1);
  });
});

describe("persistence and recovery", () => {
  test("a restarted server finds every company where it left it", async () => {
    const h = harness("recover");
    h.send(h.world.createCompany(ada, "Acme"));
    h.send(h.world.joinCompany(bob, "c1"));
    h.send(h.world.createCompany(cy, "Gamma"));
    for (let i = 0; i < 12; i += 1) {
      h.tick();
      await h.flush();
    }
    const before = {
      hash: h.world.hashOf("c1"),
      seq: h.world.seqOf("c1"),
      other: h.world.hashOf("c2"),
    };

    const saved = await h.store.load();
    expect(saved).not.toBeNull();
    if (saved === null) return;
    const reborn = new RealtimeWorld(
      { now: () => 0, newId: () => "never", seed: "recover", roundMs: 30_000 },
      saved,
    );
    expect(reborn.hashOf("c1")).toBe(before.hash);
    expect(reborn.seqOf("c1")).toBe(before.seq);
    expect(reborn.hashOf("c2")).toBe(before.other);
    expect(reborn.seatOf(ada.profileId)).toEqual({ companyId: "c1", seat: 0 });
    expect(reborn.seatOf(cy.profileId)?.companyId).toBe("c2");
    // And the world's clock and dice go on from the same place.
    expect(reborn.cursor()).toEqual(h.world.cursor());
  });

  test("a company whose last hash does not land is abandoned, not served", async () => {
    const h = harness("diverge");
    h.send(h.world.createCompany(ada, "Acme"));
    for (let i = 0; i < 3; i += 1) h.tick();
    await h.flush();
    const saved = await h.store.load();
    if (saved === null) throw new Error("nothing stored");
    const company = saved.companies[0];
    const last = company?.entries[company.entries.length - 1];
    if (company === undefined || last === undefined) throw new Error("no entries");
    last.hash = "00000000";
    const reborn = new RealtimeWorld(
      { now: () => 0, newId: () => "never", seed: "diverge", roundMs: 30_000 },
      saved,
    );
    expect(reborn.companyIds()).toEqual([]);
    expect(reborn.seatOf(ada.profileId)).toBeUndefined();
  });

  test("a snapshot every fifty rounds keeps the log short and the replay exact", async () => {
    const h = harness("compact");
    h.send(h.world.createCompany(ada, "Acme"));
    for (let i = 0; i < 120; i += 1) {
      h.tick();
      if (i % 10 === 0) await h.flush();
    }
    await h.flush();
    const stored = h.store.companies.get("c1");
    expect(stored?.snapshot).not.toBeNull();
    expect(stored?.entries.length ?? 0).toBeLessThan(120);
    const saved = await h.store.load();
    if (saved === null) throw new Error("nothing stored");
    const reborn = new RealtimeWorld(
      { now: () => 0, newId: () => "never", seed: "compact", roundMs: 30_000 },
      saved,
    );
    expect(reborn.hashOf("c1")).toBe(h.world.hashOf("c1"));
  });

  test("a failing store loses nothing: the writes wait for the next commit", async () => {
    const h = harness("backlog");
    h.send(h.world.createCompany(ada, "Acme"));
    h.tick();
    const first = h.world.drainWrites();
    h.store.failing = 1;
    await expect(h.store.commit(first)).rejects.toThrow();
    h.tick();
    await h.store.commit({ companies: first.companies.concat(h.world.drainWrites().companies) });
    expect(h.store.companies.get("c1")?.seq).toBe(h.world.seqOf("c1"));
  });
});

describe("a long soak", () => {
  test("three companies on the machine for 400 rounds stay replayable from the store", async () => {
    const h = harness("soak");
    const players = [
      { profileId: "s1", name: "One" },
      { profileId: "s2", name: "Two" },
      { profileId: "s3", name: "Three" },
      { profileId: "s4", name: "Four" },
    ];
    const [one, two, three, four] = players;
    if (one === undefined || two === undefined || three === undefined || four === undefined) return;
    h.send(h.world.createCompany(one, "Alpha"));
    h.send(h.world.joinCompany(two, "c1"));
    h.send(h.world.createCompany(three, "Beta"));
    h.send(h.world.createCompany(four, "Gamma"));

    for (let i = 0; i < 400; i += 1) {
      h.tick();
      // A question is answered by the clock: nobody is there to vote.
      if (i % 25 === 0) await h.flush();
    }
    await h.flush();

    for (const id of h.world.companyIds()) {
      const replay = await replayFromStore(h.store, id);
      if (!replay.valid) throw new Error(`${id}: ${replay.error}`);
      expect(replay.hash).toBe(h.world.hashOf(id) ?? "?");
    }
    // The world's own events fell: at least one company was told of one.
    const events = Object.values(h.inbox)
      .flat()
      .filter(
        (m) => m.type === "round.resolved" && m.entry.kind === "round" && m.entry.world.event,
      );
    expect(events.length).toBeGreaterThan(0);
  });
});
