import { describe, expect, test } from "bun:test";

import { mintTicket, TICKET_TTL_MS, TicketRegistry, verifyTicket } from "@/lib/realtime/ticket";

const secret = "0123456789abcdef0123456789abcdef";
const who = { userId: "u1", profileId: "p1", name: "Ada" };

describe("a realtime ticket", () => {
  test("proves who the player is", () => {
    const verdict = verifyTicket(secret, mintTicket(secret, who, 1000), 1500);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.payload).toMatchObject(who);
  });

  test("is refused with another secret, an edited body or a bad shape", () => {
    const ticket = mintTicket(secret, who, 1000);
    expect(verifyTicket("another-secret-of-length-16", ticket, 1500)).toEqual({
      ok: false,
      reason: "forged",
    });
    const [body, signature] = ticket.split(".");
    const edited = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body ?? "", "base64url").toString()),
        name: "Eve",
      }),
    ).toString("base64url");
    expect(verifyTicket(secret, `${edited}.${signature}`, 1500)).toEqual({
      ok: false,
      reason: "forged",
    });
    expect(verifyTicket(secret, "nonsense", 1500)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyTicket(secret, "a.b.c", 1500)).toEqual({ ok: false, reason: "malformed" });
  });

  test("expires after a minute", () => {
    const ticket = mintTicket(secret, who, 1000);
    expect(verifyTicket(secret, ticket, 1000 + TICKET_TTL_MS - 1).ok).toBe(true);
    expect(verifyTicket(secret, ticket, 1000 + TICKET_TTL_MS)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  test("opens one connection only", () => {
    const registry = new TicketRegistry();
    const verdict = verifyTicket(secret, mintTicket(secret, who, 1000), 1500);
    if (!verdict.ok) throw new Error("expected a genuine ticket");
    expect(registry.consume(verdict.payload, 1500)).toBe(true);
    expect(registry.consume(verdict.payload, 1600)).toBe(false);
    // Once it could not be used anyway, the registry forgets it.
    const later = mintTicket(secret, who, 1000 + 2 * TICKET_TTL_MS);
    const next = verifyTicket(secret, later, 1000 + 2 * TICKET_TTL_MS + 1);
    if (!next.ok) throw new Error("expected a genuine ticket");
    expect(registry.consume(next.payload, 1000 + 2 * TICKET_TTL_MS + 1)).toBe(true);
  });
});
