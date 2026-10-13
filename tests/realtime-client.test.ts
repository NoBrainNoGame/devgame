import { describe, expect, test } from "bun:test";

import type { PlayerAction } from "@/game/core/types";
import type { AppliedEntryDto, ServerMessage } from "@/game/dto/realtime";
import { PROTOCOL_VERSION } from "@/game/dto/realtime";
import {
  backoffDelay,
  RealtimeClient,
  type SocketLike,
  type TicketResult,
} from "@/realtime/client/client";
import { EntryDriver, type EntrySink } from "@/realtime/client/driver";
import { initialRealtimeState, reduce } from "@/realtime/client/reduce";
import { createRealtimeStore } from "@/realtime/client/store";

const start = {
  seed: "s",
  name: "Acme",
  founder: "Ada",
  profileId: "junior",
  unlockedSkills: [],
  startingSkillPoints: 0,
};

function row(seq: number, hash = `h${seq}`): AppliedEntryDto {
  return { seq, hash, entry: { kind: "act", seat: 0, action: { type: "buy_point" } } };
}

function server(message: ServerMessage, at = 1000) {
  return { type: "server" as const, message, receivedAt: at };
}

function joined(entries: AppliedEntryDto[] = [], seq = 0): ServerMessage {
  return {
    type: "company.joined",
    companyId: "c1",
    seat: 0,
    site: "hq",
    start,
    entries,
    members: [{ seat: 0, profileId: "p1", name: "Ada", site: "hq", status: "online" }],
    round: { round: 0, deadline: 31_000 },
    ...(seq === 0 ? {} : { snapshot: { seq, state: {} } }),
  };
}

describe("the realtime reducer", () => {
  test("the welcome sets who I am and how far the server's clock is from mine", () => {
    const state = reduce(
      initialRealtimeState(),
      server(
        {
          type: "welcome",
          protocol: 1,
          now: 5000,
          roundSeconds: 30,
          you: { profileId: "p1", name: "Ada" },
        },
        4200,
      ),
    );
    expect(state.me).toEqual({ profileId: "p1", name: "Ada" });
    expect(state.clockOffset).toBe(800);
  });

  test("joining a company remounts the stage and starts the thread where the server says", () => {
    let state = reduce(initialRealtimeState(), server(joined([row(1), row(2)])));
    expect(state.join?.companyId).toBe("c1");
    expect(state.mountKey).toBe(1);
    expect(state.appliedSeq).toBe(2);
    expect(state.inbox).toEqual([]);
    expect(state.round?.deadline).toBe(31_000);
    state = reduce(state, server(joined([row(1), row(2), row(3)])));
    expect(state.mountKey).toBe(2);
    expect(state.appliedSeq).toBe(3);
  });

  test("a snapshot stands for the entries before it", () => {
    const state = reduce(initialRealtimeState(), server(joined([], 50)));
    expect(state.appliedSeq).toBe(50);
  });

  test("entries queue in order, once, and never again after they are applied", () => {
    let state = reduce(initialRealtimeState(), server(joined([row(1)])));
    for (const seq of [3, 2, 2, 4]) {
      state = reduce(state, server({ type: "entry.applied", ...row(seq) }));
    }
    expect(state.inbox.map((r) => r.seq)).toEqual([2, 3, 4]);
    state = reduce(state, { type: "applied", seq: 3 });
    expect(state.inbox.map((r) => r.seq)).toEqual([4]);
    state = reduce(state, server({ type: "entry.applied", ...row(3) }));
    expect(state.inbox.map((r) => r.seq)).toEqual([4]);
  });

  test("a round: opens, collects the others' progress, my choice, then resolves", () => {
    let state = reduce(initialRealtimeState(), server(joined([row(1)])));
    state = reduce(state, server({ type: "round.open", round: 1, deadline: 61_000 }));
    expect(state.round).toMatchObject({ round: 1, sent: [], mine: null });
    const choice: PlayerAction = { type: "commit", mode: "craft" };
    state = reduce(state, { type: "chose", action: choice });
    state = reduce(state, server({ type: "round.ack", round: 1 }));
    state = reduce(state, server({ type: "round.progress", round: 1, sent: [0, 2] }));
    expect(state.round).toMatchObject({ mine: choice, acknowledged: true, sent: [0, 2] });
    // A progress for another round is not mine to show.
    state = reduce(state, server({ type: "round.progress", round: 0, sent: [9] }));
    expect(state.round?.sent).toEqual([0, 2]);

    state = reduce(
      state,
      server({
        type: "round.resolved",
        ...row(2),
        substituted: [1],
        misses: { "1": 2 },
        autopilot: [],
      }),
    );
    expect(state.round).toBeNull();
    expect(state.resolved).toMatchObject({ substituted: [1], misses: { "1": 2 } });
    expect(state.inbox.map((r) => r.seq)).toEqual([2]);
  });

  test("a question opens, counts votes, remembers mine and announces its result", () => {
    let state = reduce(initialRealtimeState(), server(joined([row(1)])));
    state = reduce(
      state,
      server({ type: "question.open", kind: "relic", options: ["a", "b"], deadline: 9 }),
    );
    state = reduce(state, { type: "voted", choice: "b" });
    state = reduce(state, server({ type: "question.votes", votes: { b: 1 } }));
    expect(state.question).toMatchObject({ myVote: "b", votes: { b: 1 }, result: null });
    state = reduce(state, server({ type: "question.result", choice: "b", votes: { b: 2 } }));
    expect(state.question?.result).toEqual({ choice: "b", votes: { b: 2 } });
  });

  test("seats change; my own leaving sends me back to the lobby", () => {
    let state = reduce(
      initialRealtimeState(),
      server({
        type: "welcome",
        protocol: 1,
        now: 0,
        roundSeconds: 30,
        you: { profileId: "p1", name: "Ada" },
      }),
    );
    state = reduce(state, server(joined([row(1)])));
    const bob = { seat: 1, profileId: "p2", name: "Bob", site: "hq", status: "online" as const };
    state = reduce(state, server({ type: "seat.changed", member: bob, change: "joined" }));
    expect(state.members.map((m) => m.name)).toEqual(["Ada", "Bob"]);
    state = reduce(
      state,
      server({ type: "seat.changed", member: { ...bob, status: "autopilot" }, change: "status" }),
    );
    expect(state.members.find((m) => m.seat === 1)?.status).toBe("autopilot");
    state = reduce(state, server({ type: "seat.changed", member: bob, change: "left" }));
    expect(state.members.map((m) => m.name)).toEqual(["Ada"]);
    state = reduce(
      state,
      server({
        type: "seat.changed",
        member: { seat: 0, profileId: "p1", name: "Ada", site: "hq", status: "online" },
        change: "left",
      }),
    );
    expect(state.join).toBeNull();
  });

  test("errors are kept, few, and can be dismissed", () => {
    let state = initialRealtimeState();
    for (let i = 0; i < 8; i += 1) {
      state = reduce(state, server({ type: "error", code: `e${i}`, message: "no" }, i));
    }
    expect(state.errors).toHaveLength(5);
    expect(state.errors[0]?.code).toBe("e3");
    state = reduce(state, { type: "dismissed", at: 7 });
    expect(state.errors.map((e) => e.at)).toEqual([3, 4, 5, 6]);
  });
});

/** A socket the test drives by hand. */
class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  private readonly listeners: Record<string, ((event: never) => void)[]> = {};
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners[type] ?? [];
    listeners.push(listener);
    this.listeners[type] = listeners;
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners[type] ?? []) listener(event as never);
  }
  receive(message: ServerMessage): void {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

function rig(tickets: TicketResult[] = []) {
  const store = createRealtimeStore();
  const sockets: FakeSocket[] = [];
  const timers: { run: () => void; delay: number; live: boolean }[] = [];
  const queue = [...tickets];
  const client = new RealtimeClient({
    store,
    fetchTicket: async () => queue.shift() ?? { ok: true, ticket: "T", url: "ws://x/realtime/ws" },
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    now: () => 1000,
    setTimer: (run, delay) => {
      const timer = { run, delay, live: true };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { live: boolean }).live = false;
    },
    random: () => 0,
  });
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const welcome: ServerMessage = {
    type: "welcome",
    protocol: PROTOCOL_VERSION,
    now: 1000,
    roundSeconds: 30,
    you: { profileId: "p1", name: "Ada" },
  };
  return { store, client, sockets, timers, settle, welcome };
}

describe("the realtime client", () => {
  test("asks for a ticket, opens the socket, says hello, and is open at the welcome", async () => {
    const r = rig();
    r.client.retain();
    await r.settle();
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]?.url).toBe("ws://x/realtime/ws?ticket=T");
    expect(r.store.getState().connection).toBe("connecting");
    r.sockets[0]?.emit("open");
    expect(JSON.parse(r.sockets[0]?.sent[0] ?? "{}")).toMatchObject({
      type: "hello",
      protocol: PROTOCOL_VERSION,
    });
    r.sockets[0]?.receive(r.welcome);
    expect(r.store.getState().connection).toBe("open");
    expect(r.store.getState().me?.name).toBe("Ada");
  });

  test("backs off with jitter when the socket drops, and starts over at the next welcome", async () => {
    expect(backoffDelay(0, 0)).toBe(250);
    expect(backoffDelay(0, 1)).toBe(500);
    expect(backoffDelay(3, 0)).toBe(2000);
    expect(backoffDelay(30, 1)).toBe(30_000);

    const r = rig();
    r.client.retain();
    await r.settle();
    r.sockets[0]?.emit("open");
    r.sockets[0]?.receive(r.welcome);
    r.sockets[0]?.emit("close", { code: 1006 });
    expect(r.store.getState().connection).toBe("reconnecting");
    const retry = r.timers.filter((t) => t.live).at(-1);
    expect(retry?.delay).toBe(250);
    retry?.run();
    await r.settle();
    expect(r.sockets).toHaveLength(2);
    r.sockets[1]?.emit("close", { code: 1006 });
    expect(r.timers.filter((t) => t.live).at(-1)?.delay).toBe(500);
    r.timers
      .filter((t) => t.live)
      .at(-1)
      ?.run();
    await r.settle();
    r.sockets[2]?.emit("open");
    r.sockets[2]?.receive(r.welcome);
    expect(r.store.getState().attempt).toBe(0);
  });

  test("keeps the socket alive with a ping every twenty seconds", async () => {
    const r = rig();
    r.client.retain();
    await r.settle();
    r.sockets[0]?.emit("open");
    r.sockets[0]?.receive(r.welcome);
    const keepAlive = r.timers.filter((t) => t.live).at(-1);
    expect(keepAlive?.delay).toBe(20_000);
    keepAlive?.run();
    expect(JSON.parse(r.sockets[0]?.sent.at(-1) ?? "{}")).toEqual({ type: "ping" });
  });

  test("not signed in or multiplayer off: it stops, it does not hammer", async () => {
    const signedOut = rig([{ ok: false, status: 401 }]);
    signedOut.client.retain();
    await signedOut.settle();
    expect(signedOut.store.getState().connection).toBe("closed");
    expect(signedOut.sockets).toHaveLength(0);
    expect(signedOut.timers.filter((t) => t.live)).toHaveLength(0);

    const off = rig([{ ok: false, status: 404 }]);
    off.client.retain();
    await off.settle();
    expect(off.store.getState().connection).toBe("disabled");
  });

  test("a server hiccup on the ticket route is retried", async () => {
    const r = rig([{ ok: false, status: 500 }]);
    r.client.retain();
    await r.settle();
    expect(r.store.getState().connection).toBe("reconnecting");
    r.timers
      .filter((t) => t.live)
      .at(-1)
      ?.run();
    await r.settle();
    expect(r.sockets).toHaveLength(1);
  });

  test("an outdated client stops for good", async () => {
    const r = rig();
    r.client.retain();
    await r.settle();
    r.sockets[0]?.emit("open");
    r.sockets[0]?.receive({ type: "error", code: "outdated", message: "reload" });
    expect(r.store.getState().connection).toBe("outdated");
    r.sockets[0]?.emit("close", { code: 4010 });
    expect(r.timers.filter((t) => t.live)).toHaveLength(0);
  });

  test("the last screen to let go closes the socket", async () => {
    const r = rig();
    r.client.retain();
    r.client.retain();
    await r.settle();
    expect(r.sockets).toHaveLength(1);
    r.client.release();
    expect(r.sockets[0]?.closed).toBe(false);
    r.client.release();
    expect(r.sockets[0]?.closed).toBe(true);
    expect(r.store.getState().connection).toBe("idle");
  });

  test("a turn action is the round's choice; anything else is sent at once; nothing offline", async () => {
    const r = rig();
    expect(r.client.submit({ type: "buy_point" })).toEqual({ ok: false, reason: "offline" });
    r.client.retain();
    await r.settle();
    r.sockets[0]?.emit("open");
    r.sockets[0]?.receive(r.welcome);
    expect(r.client.submit({ type: "commit", mode: "craft" })).toEqual({
      ok: false,
      reason: "no-round",
    });
    r.sockets[0]?.receive(joined([row(1)]));
    expect(r.client.submit({ type: "commit", mode: "craft" })).toEqual({ ok: true });
    expect(JSON.parse(r.sockets[0]?.sent.at(-1) ?? "{}")).toMatchObject({
      type: "round.act",
      round: 0,
    });
    expect(r.store.getState().round?.mine).toEqual({ type: "commit", mode: "craft" });
    expect(r.client.submit({ type: "buy_point" })).toEqual({ ok: true });
    expect(JSON.parse(r.sockets[0]?.sent.at(-1) ?? "{}")).toMatchObject({ type: "company.act" });
    // Nothing was applied by sending: the state only moves on the echo.
    expect(r.store.getState().inbox).toEqual([]);
  });

  test("drops a frame that is not the protocol without dying", async () => {
    const r = rig();
    r.client.retain();
    await r.settle();
    r.sockets[0]?.emit("open");
    r.sockets[0]?.emit("message", { data: "not json" });
    r.sockets[0]?.emit("message", { data: JSON.stringify({ type: "mystery" }) });
    r.sockets[0]?.receive(r.welcome);
    expect(r.store.getState().connection).toBe("open");
  });
});

/** A stage that applies entries by writing down their hash. */
function sink(
  options: { hashes?: Record<number, string>; refuse?: number; busyFor?: number } = {},
) {
  const applied: number[] = [];
  let hash = "start";
  let skipped = 0;
  let busy = options.busyFor ?? 0;
  const stage: EntrySink = {
    applyEntry(entry) {
      if (entry.seq === options.refuse) return false;
      applied.push(entry.seq);
      hash = options.hashes?.[entry.seq] ?? entry.hash;
      return true;
    },
    hash: () => hash,
    busy: () => busy > 0,
    skip: () => {
      skipped += 1;
      busy = 0;
    },
  };
  return { stage, applied, skipped: () => skipped };
}

describe("the entry driver", () => {
  function drive(stage: EntrySink, desyncs: [number, string][] = []) {
    const store = createRealtimeStore();
    store.getState().dispatch(server(joined([row(1)])));
    const driver = new EntryDriver({
      store,
      sink: stage,
      onDesync: (seq, hash) => desyncs.push([seq, hash]),
    });
    return { store, driver };
  }

  test("applies the queue in order and moves the applied mark", () => {
    const s = sink();
    const { store, driver } = drive(s.stage);
    for (const seq of [2, 3, 4])
      store.getState().dispatch(server({ type: "entry.applied", ...row(seq) }));
    driver.drain();
    expect(s.applied).toEqual([2, 3, 4]);
    expect(store.getState().appliedSeq).toBe(4);
    expect(store.getState().inbox).toEqual([]);
  });

  test("lets the canvas finish what it is playing before the next entry", () => {
    const s = sink({ busyFor: 1 });
    const { store, driver } = drive(s.stage);
    store.getState().dispatch(server({ type: "entry.applied", ...row(2) }));
    driver.drain();
    expect(s.skipped()).toBe(1);
    expect(s.applied).toEqual([2]);
  });

  test("a gap in the sequence is a drift: it asks to be sent again", () => {
    const desyncs: [number, string][] = [];
    const s = sink();
    const { store, driver } = drive(s.stage, desyncs);
    store.getState().dispatch(server({ type: "entry.applied", ...row(3) }));
    driver.drain();
    expect(s.applied).toEqual([]);
    expect(desyncs).toEqual([[1, "start"]]);
    // And it does not keep asking while it waits for the answer.
    driver.drain();
    expect(desyncs).toHaveLength(1);
  });

  test("an entry the engine refuses, or a hash that differs, is a drift", () => {
    const refused: [number, string][] = [];
    const a = sink({ refuse: 2 });
    const first = drive(a.stage, refused);
    first.store.getState().dispatch(server({ type: "entry.applied", ...row(2) }));
    first.driver.drain();
    expect(refused).toHaveLength(1);

    const mismatched: [number, string][] = [];
    const b = sink({ hashes: { 2: "other" } });
    const second = drive(b.stage, mismatched);
    second.store.getState().dispatch(server({ type: "entry.applied", ...row(2) }));
    second.driver.drain();
    expect(mismatched).toEqual([[1, "other"]]);
  });

  test("starts over cleanly when the company is sent again", () => {
    const desyncs: [number, string][] = [];
    const s = sink();
    const { store, driver } = drive(s.stage, desyncs);
    store.getState().dispatch(server({ type: "entry.applied", ...row(5) }));
    driver.drain();
    expect(desyncs).toHaveLength(1);
    store.getState().dispatch(server(joined([row(1), row(2), row(3), row(4), row(5)])));
    driver.reset();
    store.getState().dispatch(server({ type: "entry.applied", ...row(6) }));
    driver.drain();
    expect(s.applied).toEqual([6]);
  });
});
