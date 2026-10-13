import "@/lib/server-only";

import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";

import {
  type ClientMessage,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ServerMessage,
} from "@/game/dto/realtime";
import { CREW_FINGERPRINT, RULES_FINGERPRINT } from "@/game/dto/version";
import { TicketRegistry, verifyTicket } from "@/lib/realtime/ticket";
import { RoundClock } from "@/realtime/clock";
import { REALTIME_LIMITS } from "@/realtime/limits";
import { Persister } from "@/realtime/persister";
import type { Store } from "@/realtime/store";
import { type Out, type Profile, RealtimeWorld, WorldError } from "@/realtime/world";

/**
 * The realtime server: a Bun process that owns the world in memory, keeps a
 * 30-second clock, and speaks the protocol of `dto/realtime.ts` over
 * WebSockets. It is the only writer of the multiplayer tables.
 *
 * Everything with an outside is injected — the store, the clock's source of
 * time, the secret, the allowed origin — so the whole of it runs in a test on
 * port 0 with a fake clock. Only `import.meta.main`, at the bottom, reads the
 * environment and opens the database.
 */

/** WebSocket close codes, in the application range. */
export const CLOSE = {
  badHello: 4008,
  tooMany: 4009,
  outdated: 4010,
  rateLimited: 4029,
  tooBig: 1009,
} as const;

export interface RealtimeServerOptions {
  /** 0 picks a free port (tests). */
  port: number;
  /** Signs the tickets: `BETTER_AUTH_SECRET`. */
  secret: string;
  /** The origin browsers connect from. Null skips the check (tests, non-browser clients). */
  allowedOrigin: string | null;
  store: Store;
  now?: () => number;
  roundMs?: number;
  newId?: () => string;
  /** Replaces the timer source; the tests tick by hand. */
  manualClock?: boolean;
}

interface SocketData {
  profile: Profile;
  id: string;
  helloDone: boolean;
  helloTimer: ReturnType<typeof setTimeout> | null;
  windowStart: number;
  windowCount: number;
}

type Socket = ServerWebSocket<SocketData>;

export interface RealtimeServer {
  port: number;
  world: RealtimeWorld;
  persister: Persister;
  /** Runs one tick now (tests). */
  tickNow(): Promise<void>;
  stop(): Promise<void>;
}

export async function createRealtimeServer(
  options: RealtimeServerOptions,
): Promise<RealtimeServer> {
  const now = options.now ?? Date.now;
  const roundMs = options.roundMs ?? 30_000;
  const registry = new TicketRegistry();

  const loaded = await options.store.load();
  const stored = loaded ?? null;
  const worldRow =
    stored?.world ?? (await options.store.create({ id: "main", seed: randomUUID() }));
  const world = new RealtimeWorld(
    { now, newId: options.newId ?? (() => randomUUID()), seed: worldRow.seed, roundMs },
    stored === null ? undefined : { world: stored.world, companies: stored.companies },
  );

  const sockets = new Map<string, Set<Socket>>();
  let stopping = false;

  const send = (socket: Socket, message: ServerMessage): void => {
    socket.send(JSON.stringify(message));
  };

  const deliver = (outs: readonly Out[]): void => {
    for (const out of outs) {
      const targets =
        "profile" in out.to ? [out.to.profile] : world.audience(out.to.company, out.to.except);
      for (const profileId of targets) {
        for (const socket of sockets.get(profileId) ?? []) send(socket, out.message);
      }
    }
  };

  const deliverRankings = (): void => {
    for (const [profileId, set] of sockets) {
      const message = world.ranking(profileId);
      for (const socket of set) send(socket, message);
    }
  };

  const clock = new RoundClock({
    now,
    roundMs,
    onTick: async (nextDeadline) => {
      deliver(world.tick(nextDeadline));
      deliverRankings();
      await persister.flush();
    },
  });

  const persister = new Persister(options.store, world, {
    onPause: () => {
      console.error("realtime: the store keeps failing, the clock is paused");
      clock.stop();
    },
    onResume: () => {
      console.info("realtime: the store is back, the clock resumes");
      clock.resume();
    },
  });

  const fail = (socket: Socket, code: string, message: string): void => {
    send(socket, { type: "error", code, message });
  };

  const handle = async (socket: Socket, message: ClientMessage): Promise<void> => {
    const { profile } = socket.data;
    switch (message.type) {
      case "hello":
        return;
      case "ping":
        send(socket, { type: "pong" });
        return;
      case "lobby.join":
        if (world.seatOf(profile.profileId) === undefined) {
          send(socket, world.lobbyState(profile.profileId));
        }
        return;
      case "lobby.wait":
        deliver(world.wait(profile));
        return;
      case "lobby.unwait":
        deliver(world.unwait(profile.profileId));
        return;
      case "company.create":
        deliver(world.createCompany(profile, message.name));
        return;
      case "company.join":
        deliver(world.joinCompany(profile, message.companyId));
        return;
      case "company.recruit":
        deliver(world.recruit(profile.profileId, message.profileId));
        return;
      case "seat.leave":
        deliver(world.leave(profile.profileId));
        return;
      case "company.act":
        deliver(world.act(profile.profileId, message.action));
        return;
      case "round.act":
        deliver(world.roundAct(profile.profileId, message.round, message.action));
        return;
      case "question.vote":
        deliver(world.vote(profile.profileId, message.choice));
        return;
      case "resync":
        deliver(world.resync(profile.profileId, message.seq, message.hash));
        return;
    }
  };

  const server = Bun.serve<SocketData>({
    port: options.port,
    fetch(request, bunServer) {
      const url = new URL(request.url);
      if (url.pathname === "/realtime/health") return Response.json({ ok: true });
      if (url.pathname !== "/realtime/ws") return new Response("Not found", { status: 404 });

      if (
        options.allowedOrigin !== null &&
        request.headers.get("origin") !== options.allowedOrigin
      ) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const ticket = url.searchParams.get("ticket");
      if (ticket === null) return new Response("A ticket is required", { status: 401 });
      const verdict = verifyTicket(options.secret, ticket, now());
      if (!verdict.ok) return new Response(`Ticket ${verdict.reason}`, { status: 401 });
      if (!registry.consume(verdict.payload, now())) {
        return new Response("Ticket already used", { status: 401 });
      }
      if (
        (sockets.get(verdict.payload.profileId)?.size ?? 0) >= REALTIME_LIMITS.socketsPerProfile
      ) {
        return new Response("Too many connections", { status: 429 });
      }

      const data: SocketData = {
        profile: { profileId: verdict.payload.profileId, name: verdict.payload.name },
        id: randomUUID(),
        helloDone: false,
        helloTimer: null,
        windowStart: now(),
        windowCount: 0,
      };
      return bunServer.upgrade(request, { data })
        ? undefined
        : new Response("Upgrade failed", { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      open(socket) {
        const set = sockets.get(socket.data.profile.profileId) ?? new Set<Socket>();
        set.add(socket);
        sockets.set(socket.data.profile.profileId, set);
        // A socket that never says hello is somebody else's probe.
        socket.data.helloTimer = setTimeout(() => {
          if (!socket.data.helloDone) socket.close(CLOSE.badHello, "hello expected");
        }, REALTIME_LIMITS.helloMs);
      },
      async message(socket, raw) {
        const { data } = socket;
        const at = now();
        if (at - data.windowStart > REALTIME_LIMITS.messages.windowMs) {
          data.windowStart = at;
          data.windowCount = 0;
        }
        data.windowCount += 1;
        if (data.windowCount > REALTIME_LIMITS.messages.limit) {
          socket.close(CLOSE.rateLimited, "too many messages");
          return;
        }

        if (typeof raw !== "string") {
          fail(socket, "bad-frame", "Text frames only");
          return;
        }
        const message = parseClientMessage(raw);
        if (message === null) {
          fail(socket, "bad-message", "That is not a message this server understands");
          return;
        }

        if (!data.helloDone) {
          if (message.type !== "hello") {
            socket.close(CLOSE.badHello, "hello first");
            return;
          }
          if (
            message.protocol !== PROTOCOL_VERSION ||
            message.rules !== RULES_FINGERPRINT ||
            message.crew !== CREW_FINGERPRINT
          ) {
            fail(
              socket,
              "outdated",
              "Reload the page: this client plays another version of the game",
            );
            socket.close(CLOSE.outdated, "outdated client");
            return;
          }
          data.helloDone = true;
          if (data.helloTimer !== null) clearTimeout(data.helloTimer);
          send(socket, {
            type: "welcome",
            protocol: PROTOCOL_VERSION,
            now: now(),
            roundSeconds: roundMs / 1000,
            you: data.profile,
          });
          // Only the first socket of a profile announces them to the world.
          if ((sockets.get(data.profile.profileId)?.size ?? 0) === 1) {
            deliver(world.connect(data.profile));
          } else if (world.seatOf(data.profile.profileId) === undefined) {
            send(socket, world.lobbyState(data.profile.profileId));
          } else {
            for (const out of world.connect(data.profile)) {
              if ("profile" in out.to && out.to.profile === data.profile.profileId)
                send(socket, out.message);
            }
          }
          send(socket, world.ranking(data.profile.profileId));
          return;
        }

        if (message.type === "hello") {
          fail(socket, "bad-message", "Already said hello");
          return;
        }

        try {
          await handle(socket, message);
        } catch (error) {
          if (error instanceof WorldError) fail(socket, error.code, error.message);
          else {
            console.error("realtime: a message failed", error);
            fail(socket, "internal", "Something went wrong on our side");
          }
        }
        // Whatever the message changed is on its way to the store.
        void persister.flush().catch((error: unknown) => console.error("realtime: flush", error));
      },
      close(socket) {
        const { profile } = socket.data;
        if (socket.data.helloTimer !== null) clearTimeout(socket.data.helloTimer);
        const set = sockets.get(profile.profileId);
        set?.delete(socket);
        if (set !== undefined && set.size > 0) return;
        sockets.delete(profile.profileId);
        if (socket.data.helloDone && !stopping) deliver(world.disconnect(profile.profileId));
      },
    },
  });

  if (options.manualClock === true) {
    world.start(now() + roundMs);
  } else {
    clock.start();
    world.start(clock.nextDeadline());
  }

  return {
    port: server.port ?? options.port,
    world,
    persister,
    async tickNow(): Promise<void> {
      deliver(world.tick(now() + roundMs));
      deliverRankings();
      await persister.flush();
    },
    async stop(): Promise<void> {
      stopping = true;
      clock.stop();
      deliver(world.shutdown());
      await persister.flush();
      // `stop(true)` closes the sockets itself. Closing them one by one first
      // leaves Bun waiting on the handshakes forever; clients reconnect on any close.
      await Promise.race([server.stop(true), Bun.sleep(2000)]);
    },
  };
}

/** `bun run realtime`: the real thing, against the real database. */
async function main(): Promise<void> {
  const { env } = await import("@/lib/env");
  const { PrismaStore } = await import("@/realtime/prismaStore");

  if (!env.ONLINE || env.BETTER_AUTH_SECRET === undefined) {
    console.error("No DATABASE_URL: multiplayer needs a database. `bun run init` first.");
    process.exit(1);
  }
  if (!env.REALTIME_ENABLED) {
    console.info("REALTIME_ENABLED is false: the realtime server stays off.");
    return;
  }

  const server = await createRealtimeServer({
    port: env.REALTIME_PORT,
    secret: env.BETTER_AUTH_SECRET,
    allowedOrigin: new URL(env.APP_URL).origin,
    store: new PrismaStore(),
  });
  console.info(
    `realtime: listening on :${server.port}, ${server.world.companyIds().length} companies`,
  );

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.info("realtime: stopping");
    await server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
