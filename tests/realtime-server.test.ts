import { afterEach, describe, expect, test } from "bun:test";

import { hashState } from "@/game/core/run";
import { applyEntry, startCompany } from "@/game/dto/company";
import { PROTOCOL_VERSION, parseServerMessage, type ServerMessage } from "@/game/dto/realtime";
import { CREW_FINGERPRINT, RULES_FINGERPRINT } from "@/game/dto/version";
import { mintTicket } from "@/lib/realtime/ticket";
import { CLOSE, createRealtimeServer, type RealtimeServer } from "@/realtime/server";
import { MemoryStore } from "@/realtime/store";

const secret = "0123456789abcdef0123456789abcdef";
const hello = {
  type: "hello",
  protocol: PROTOCOL_VERSION,
  rules: RULES_FINGERPRINT,
  crew: CREW_FINGERPRINT,
};

let server: RealtimeServer | null = null;
afterEach(async () => {
  await server?.stop();
  server = null;
});

async function boot(store = new MemoryStore()): Promise<RealtimeServer> {
  let ids = 0;
  server = await createRealtimeServer({
    port: 0,
    secret,
    allowedOrigin: null,
    store,
    roundMs: 30_000,
    manualClock: true,
    newId: () => {
      ids += 1;
      return `c${ids}`;
    },
  });
  return server;
}

interface Client {
  socket: WebSocket;
  messages: ServerMessage[];
  closed: Promise<number>;
  send(message: unknown): void;
  next<T extends ServerMessage["type"]>(
    type: T,
    after?: number,
  ): Promise<Extract<ServerMessage, { type: T }>>;
}

async function connect(
  port: number,
  profileId: string,
  name: string,
  ticket?: string,
): Promise<Client> {
  const token = ticket ?? mintTicket(secret, { userId: `u-${profileId}`, profileId, name });
  const socket = new WebSocket(`ws://localhost:${port}/realtime/ws?ticket=${token}`);
  const messages: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  socket.addEventListener("message", (event) => {
    const parsed = parseServerMessage(String(event.data));
    if (parsed !== null) messages.push(parsed);
    for (const wake of waiters.splice(0)) wake();
  });
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code));
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("socket refused")));
  });
  const client: Client = {
    socket,
    messages,
    closed,
    send: (message) => socket.send(JSON.stringify(message)),
    async next(type, after = 0) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const found = messages.slice(after).find((m) => m.type === type);
        if (found !== undefined) return found as never;
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 25);
        });
      }
      throw new Error(`no ${type} arrived; got ${messages.map((m) => m.type).join(", ")}`);
    },
  };
  return client;
}

async function greeted(port: number, profileId: string, name: string): Promise<Client> {
  const client = await connect(port, profileId, name);
  client.send(hello);
  await client.next("welcome");
  return client;
}

describe("the realtime server", () => {
  test("two sockets, one company, a resolved round whose hash equals a local replay", async () => {
    const running = await boot();
    const ada = await greeted(running.port, "p-ada", "Ada");
    const bob = await greeted(running.port, "p-bob", "Bob");

    ada.send({ type: "company.create", name: "Acme" });
    const created = await ada.next("company.joined");
    bob.send({ type: "company.join", companyId: created.companyId });
    const joined = await bob.next("company.joined");
    expect(joined.seat).toBe(1);
    await ada.next("seat.changed");

    // Each client rebuilds the company locally from what it was sent.
    let local = startCompany(joined.start as never);
    for (const row of joined.entries) local = applyEntry(local, row.entry).state;
    expect(hashState(local)).toBe(joined.entries[joined.entries.length - 1]?.hash ?? "");

    for (const [client, seat] of [
      [ada, 0],
      [bob, 1],
    ] as const) {
      const mark = client.messages.length;
      client.send({
        type: "company.act",
        action: { type: "start", ticketId: pickBacklog(running, created.companyId, seat) },
      });
      await client.next("entry.applied", mark);
    }
    const adaMark = ada.messages.length;
    const bobMark = bob.messages.length;
    ada.send({ type: "round.act", round: 0, action: { type: "commit", mode: "craft" } });
    bob.send({ type: "round.act", round: 0, action: { type: "commit", mode: "ai" } });
    await ada.next("round.ack", adaMark);
    await bob.next("round.ack", bobMark);

    const seenBefore = ada.messages.length;
    await running.tickNow();
    const resolved = await ada.next("round.resolved", seenBefore);
    const sameForBob = await bob.next("round.resolved", bobMark);
    expect(sameForBob.hash).toBe(resolved.hash);

    // Replay the stream the client received: the hash must be the server's.
    let replayed = startCompany(created.start as never);
    for (const message of ada.messages) {
      if (message.type === "entry.applied" || message.type === "round.resolved") {
        replayed = applyEntry(replayed, message.entry).state;
        expect(hashState(replayed)).toBe(message.hash);
      }
    }
    expect(hashState(replayed)).toBe(running.world.hashOf(created.companyId) ?? "?");

    ada.socket.close();
    bob.socket.close();
  });

  test("refuses a connection without a ticket, with a forged one, or twice with the same", async () => {
    const running = await boot();
    const base = `ws://localhost:${running.port}/realtime/ws`;
    const open = (url: string): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => {
          socket.close();
          resolve(true);
        });
        socket.addEventListener("error", () => resolve(false));
      });
    expect(await open(base)).toBe(false);
    expect(await open(`${base}?ticket=nonsense`)).toBe(false);
    expect(
      await open(
        `${base}?ticket=${mintTicket("another-secret-of-length-16", { userId: "u", profileId: "p", name: "N" })}`,
      ),
    ).toBe(false);
    const ticket = mintTicket(secret, { userId: "u", profileId: "p", name: "N" });
    expect(await open(`${base}?ticket=${ticket}`)).toBe(true);
    expect(await open(`${base}?ticket=${ticket}`)).toBe(false);
  });

  test("checks the origin when it is told to", async () => {
    const store = new MemoryStore();
    server = await createRealtimeServer({
      port: 0,
      secret,
      allowedOrigin: "https://devgame.example",
      store,
      manualClock: true,
    });
    const response = await fetch(`http://localhost:${server.port}/realtime/ws?ticket=x`, {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    const health = await fetch(`http://localhost:${server.port}/realtime/health`);
    expect(await health.json()).toEqual({ ok: true });
  });

  test("closes a client on another version, and a socket that skips hello", async () => {
    const running = await boot();
    const old = await connect(running.port, "p-old", "Old");
    old.send({ ...hello, crew: "00000000" });
    expect(await old.closed).toBe(CLOSE.outdated);

    const rude = await connect(running.port, "p-rude", "Rude");
    rude.send({ type: "ping" });
    expect(await rude.closed).toBe(CLOSE.badHello);
  });

  test("answers junk with an error and keeps the socket", async () => {
    const running = await boot();
    const client = await greeted(running.port, "p-junk", "Junk");
    client.socket.send("not json");
    client.send({ type: "company.create", name: "ab" });
    client.send({ type: "round.act", round: 0, action: { type: "dev_set", values: {} } });
    const errors = [await client.next("error")];
    expect(errors[0]?.code).toBe("bad-message");
    client.send({ type: "ping" });
    await client.next("pong");
  });

  test("a company outlives its server: a new one finds it and re-seats the player", async () => {
    const store = new MemoryStore();
    const first = await boot(store);
    const ada = await greeted(first.port, "p-ada", "Ada");
    ada.send({ type: "company.create", name: "Acme" });
    const created = await ada.next("company.joined");
    await first.tickNow();
    await first.tickNow();
    const hash = first.world.hashOf(created.companyId);
    ada.socket.close();
    await first.stop();
    server = null;

    const second = await boot(store);
    expect(second.world.hashOf(created.companyId)).toBe(hash);
    const again = await greeted(second.port, "p-ada", "Ada");
    const back = await again.next("company.joined");
    expect(back.companyId).toBe(created.companyId);
    expect(back.seat).toBe(0);
  });

  test("a profile may hold three sockets, not four; a flood is cut off", async () => {
    const running = await boot();
    const open = (): Promise<boolean> =>
      new Promise((resolve) => {
        const ticket = mintTicket(secret, { userId: "u", profileId: "p-many", name: "Many" });
        const socket = new WebSocket(`ws://localhost:${running.port}/realtime/ws?ticket=${ticket}`);
        socket.addEventListener("open", () => resolve(true));
        socket.addEventListener("error", () => resolve(false));
      });
    expect(await open()).toBe(true);
    expect(await open()).toBe(true);
    expect(await open()).toBe(true);
    expect(await open()).toBe(false);

    const flooder = await greeted(running.port, "p-flood", "Flood");
    for (let i = 0; i < 40; i += 1) flooder.send({ type: "ping" });
    expect(await flooder.closed).toBe(CLOSE.rateLimited);
  });

  test("a second tab for the same player is seated too", async () => {
    const running = await boot();
    const first = await greeted(running.port, "p-ada", "Ada");
    first.send({ type: "company.create", name: "Acme" });
    await first.next("company.joined");
    const second = await greeted(running.port, "p-ada", "Ada");
    const joined = await second.next("company.joined");
    expect(joined.seat).toBe(0);
  });
});

function pickBacklog(running: RealtimeServer, companyId: string, _seat: number): string {
  const state = running.world.stateOf(companyId);
  const ticket = Object.values(state?.tickets ?? {}).find((t) => t.status === "backlog");
  if (ticket === undefined) throw new Error("empty backlog");
  return ticket.id;
}
