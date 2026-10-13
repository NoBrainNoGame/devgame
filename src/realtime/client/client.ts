import type { StoreApi } from "zustand/vanilla";

import { TURN_ACTIONS } from "@/game/core/rules/reducer";
import type { PlayerAction } from "@/game/core/types";
import { type ClientMessage, PROTOCOL_VERSION, parseServerMessage } from "@/game/dto/realtime";
import { CREW_FINGERPRINT, RULES_FINGERPRINT } from "@/game/dto/version";
import type { RealtimeStore } from "@/realtime/client/store";

/**
 * The browser's end of the connection: it asks the app for a ticket, opens the
 * WebSocket, says hello, keeps the socket alive and brings it back with
 * backoff when it drops. It writes what arrives to the store and sends what
 * the page asks. It owns no game state, and the socket, the timers, the
 * ticket route and the dice of the backoff are all injected so a test can
 * play a flaky network by hand.
 */

export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code: number }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

export type TicketResult =
  | { ok: true; ticket: string; url: string }
  | { ok: false; status: number };

export interface ClientOptions {
  store: StoreApi<RealtimeStore>;
  fetchTicket: () => Promise<TicketResult>;
  createSocket: (url: string) => SocketLike;
  now?: () => number;
  setTimer?: (run: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** In [0, 1): the jitter of the backoff. */
  random?: () => number;
}

export const PING_EVERY_MS = 20_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30_000;

/** How long to wait before attempt `n` (0-based): doubling, capped, jittered between half and full. */
export function backoffDelay(attempt: number, random: number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random * 0.5));
}

export class RealtimeClient {
  private readonly store: StoreApi<RealtimeStore>;
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly random: () => number;
  private socket: SocketLike | null = null;
  private retainers = 0;
  private retry: unknown = null;
  private ping: unknown = null;
  private attempt = 0;
  /** Bumped on each connection so a late event from an old socket is ignored. */
  private generation = 0;
  private terminal = false;

  constructor(private readonly options: ClientOptions) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((run, delay) => setTimeout(run, delay));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.random = options.random ?? Math.random;
  }

  // ------------------------------------------------------------- lifecycle

  /** A screen needs the connection. The first one opens it; the last one to let go closes it. */
  retain(): void {
    this.retainers += 1;
    if (this.retainers === 1) {
      this.terminal = false;
      void this.connect();
    }
  }

  release(): void {
    this.retainers = Math.max(0, this.retainers - 1);
    if (this.retainers === 0) this.close();
  }

  isOpen(): boolean {
    return this.socket !== null && this.store.getState().connection === "open";
  }

  private close(): void {
    this.generation += 1;
    this.stopTimers();
    this.socket?.close();
    this.socket = null;
    this.attempt = 0;
    this.store.getState().dispatch({ type: "connection", status: "idle" });
  }

  private stopTimers(): void {
    if (this.retry !== null) this.clearTimer(this.retry);
    if (this.ping !== null) this.clearTimer(this.ping);
    this.retry = null;
    this.ping = null;
  }

  private async connect(): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    const { dispatch } = this.store.getState();
    dispatch({
      type: "connection",
      status: this.attempt === 0 ? "connecting" : "reconnecting",
      attempt: this.attempt,
    });

    let ticket: TicketResult;
    try {
      ticket = await this.options.fetchTicket();
    } catch {
      ticket = { ok: false, status: 0 };
    }
    if (generation !== this.generation) return;

    if (!ticket.ok) {
      // Not signed in, or multiplayer is off: nothing a retry would change.
      if (ticket.status === 401 || ticket.status === 403) return this.stopFor("closed");
      if (ticket.status === 404) return this.stopFor("disabled");
      return this.scheduleRetry();
    }

    let socket: SocketLike;
    try {
      socket = this.options.createSocket(
        `${ticket.url}?ticket=${encodeURIComponent(ticket.ticket)}`,
      );
    } catch {
      return this.scheduleRetry();
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (generation !== this.generation) return;
      this.send({
        type: "hello",
        protocol: PROTOCOL_VERSION,
        rules: RULES_FINGERPRINT,
        crew: CREW_FINGERPRINT,
      });
    });
    socket.addEventListener("message", (event) => {
      if (generation !== this.generation) return;
      this.receive(event.data);
    });
    socket.addEventListener("close", () => {
      if (generation !== this.generation) return;
      this.socket = null;
      this.stopTimers();
      if (this.terminal || this.retainers === 0) return;
      this.scheduleRetry();
    });
    socket.addEventListener("error", () => {
      // The close that follows does the work.
    });
  }

  private stopFor(status: "closed" | "disabled" | "outdated"): void {
    this.terminal = true;
    this.stopTimers();
    this.socket?.close();
    this.socket = null;
    this.store.getState().dispatch({ type: "connection", status });
  }

  private scheduleRetry(): void {
    const delay = backoffDelay(this.attempt, this.random());
    this.attempt += 1;
    this.store
      .getState()
      .dispatch({ type: "connection", status: "reconnecting", attempt: this.attempt });
    this.retry = this.setTimer(() => {
      this.retry = null;
      if (this.retainers > 0 && !this.terminal) void this.connect();
    }, delay);
  }

  private receive(raw: unknown): void {
    if (typeof raw !== "string") return;
    const message = parseServerMessage(raw);
    if (message === null) {
      console.warn("realtime: a frame did not match the protocol and was dropped");
      return;
    }
    if (message.type === "welcome") {
      this.attempt = 0;
      this.store.getState().dispatch({ type: "connection", status: "open", attempt: 0 });
      this.ping = this.setTimer(() => this.keepAlive(), PING_EVERY_MS);
    }
    this.store.getState().dispatch({ type: "server", message, receivedAt: this.now() });
    if (message.type === "error" && message.code === "outdated") this.stopFor("outdated");
  }

  private keepAlive(): void {
    if (this.socket === null) return;
    this.send({ type: "ping" });
    this.ping = this.setTimer(() => this.keepAlive(), PING_EVERY_MS);
  }

  // --------------------------------------------------------------- sending

  send(message: ClientMessage): boolean {
    if (this.socket === null) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  enterLobby(): boolean {
    return this.send({ type: "lobby.join" });
  }

  wait(): boolean {
    return this.send({ type: "lobby.wait" });
  }

  unwait(): boolean {
    return this.send({ type: "lobby.unwait" });
  }

  createCompany(name: string): boolean {
    return this.send({ type: "company.create", name });
  }

  joinCompany(companyId: string): boolean {
    return this.send({ type: "company.join", companyId });
  }

  recruit(profileId: string): boolean {
    return this.send({ type: "company.recruit", profileId });
  }

  leaveSeat(): boolean {
    return this.send({ type: "seat.leave" });
  }

  vote(choice: string): boolean {
    const sent = this.send({ type: "question.vote", choice });
    if (sent) this.store.getState().dispatch({ type: "voted", choice });
    return sent;
  }

  resync(seq: number, hash: string): boolean {
    this.store.getState().dispatch({ type: "desync" });
    return this.send({ type: "resync", seq, hash });
  }

  /**
   * What a button press becomes: a turn action is the choice for this round,
   * pending and changeable until the deadline; anything else is free and goes
   * through at once. Nothing is applied here: the stage applies the echo.
   */
  submit(action: PlayerAction): { ok: true } | { ok: false; reason: string } {
    if (!this.isOpen()) return { ok: false, reason: "offline" };
    if (TURN_ACTIONS.has(action.type)) {
      const round = this.store.getState().round;
      if (round === null) return { ok: false, reason: "no-round" };
      const sent = this.send({ type: "round.act", round: round.round, action: action as never });
      if (sent) this.store.getState().dispatch({ type: "chose", action });
      return sent ? { ok: true } : { ok: false, reason: "offline" };
    }
    return this.send({ type: "company.act", action: action as never })
      ? { ok: true }
      : { ok: false, reason: "offline" };
  }

  /** Takes back this round's choice: nothing to send, the server keeps the last one it heard. */
  clearChoice(): void {
    this.store.getState().dispatch({ type: "chose", action: null });
  }
}
