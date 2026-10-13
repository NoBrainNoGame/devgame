"use client";

import { RealtimeClient, type SocketLike, type TicketResult } from "@/realtime/client/client";
import { realtimeStore } from "@/realtime/client/store";

/**
 * The page's connection: one browser, one socket, shared by the lobby and the
 * stage through `retain`/`release`. Built lazily so importing this module on
 * the server (a client component is still rendered there once) touches no
 * `WebSocket` and no `fetch`.
 */

/** A real WebSocket seen as the client's minimal socket. */
class BrowserSocket implements SocketLike {
  private readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code: number }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: never) => void,
  ): void {
    this.socket.addEventListener(type, listener as EventListener);
  }
}

async function fetchTicket(): Promise<TicketResult> {
  const response = await fetch("/api/realtime/ticket", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body: unknown = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    "ticket" in body &&
    "url" in body &&
    typeof body.ticket === "string" &&
    typeof body.url === "string"
  ) {
    return { ok: true, ticket: body.ticket, url: body.url };
  }
  return { ok: false, status: 500 };
}

let client: RealtimeClient | null = null;

export function realtimeClient(): RealtimeClient {
  client ??= new RealtimeClient({
    store: realtimeStore,
    fetchTicket,
    createSocket: (url) => new BrowserSocket(url),
  });
  return client;
}
