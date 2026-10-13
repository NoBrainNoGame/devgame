import "@/lib/server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * How a browser proves to the realtime server who it is.
 *
 * The realtime process is not Next and does not run Better Auth, so it cannot
 * read a session cookie. The app mints a short-lived ticket instead: who the
 * player is, signed with the secret both processes already share, valid for a
 * minute and for one connection. The signature covers a domain prefix so a
 * ticket can never be mistaken for anything else signed with the same secret.
 */

const DOMAIN = "devgame.realtime.ticket.v1\n";

/** Long enough for a slow connection to open, short enough to be worth nothing stolen. */
export const TICKET_TTL_MS = 60_000;

const PayloadSchema = z.object({
  userId: z.string().min(1),
  profileId: z.string().min(1),
  name: z.string().min(1).max(24),
  /** Expiry, epoch milliseconds. */
  exp: z.number().int(),
  /** Unique per ticket: what makes it single use. */
  jti: z.string().min(8).max(64),
});

export type TicketPayload = z.infer<typeof PayloadSchema>;

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(DOMAIN).update(body).digest("base64url");
}

export function mintTicket(
  secret: string,
  who: Pick<TicketPayload, "userId" | "profileId" | "name">,
  now: number = Date.now(),
): string {
  const payload: TicketPayload = { ...who, exp: now + TICKET_TTL_MS, jti: randomUUID() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export type TicketVerdict =
  | { ok: true; payload: TicketPayload }
  | { ok: false; reason: "malformed" | "forged" | "expired" };

/** Whether a ticket is genuine and fresh. Single use is the registry's job. */
export function verifyTicket(
  secret: string,
  ticket: string,
  now: number = Date.now(),
): TicketVerdict {
  const [body, signature, extra] = ticket.split(".");
  if (body === undefined || signature === undefined || extra !== undefined) {
    return { ok: false, reason: "malformed" };
  }

  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "forged" };
  }

  let parsed: ReturnType<typeof PayloadSchema.safeParse>;
  try {
    parsed = PayloadSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed.success) return { ok: false, reason: "malformed" };
  if (parsed.data.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload: parsed.data };
}

/** Remembers the tickets already used until they would have expired anyway. */
export class TicketRegistry {
  private readonly used = new Map<string, number>();

  /** True the first time a ticket is presented, false after. */
  consume(payload: TicketPayload, now: number = Date.now()): boolean {
    for (const [jti, exp] of this.used) {
      if (exp <= now) this.used.delete(jti);
    }
    if (this.used.has(payload.jti)) return false;
    this.used.set(payload.jti, payload.exp);
    return true;
  }
}
