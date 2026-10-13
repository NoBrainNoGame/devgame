import { describe, expect, test } from "bun:test";

import {
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
} from "@/game/dto/realtime";

describe("the realtime protocol", () => {
  test("reads a well-formed client message", () => {
    expect(
      parseClientMessage(
        JSON.stringify({ type: "round.act", round: 4, action: { type: "commit", mode: "ai" } }),
      ),
    ).toEqual({ type: "round.act", round: 4, action: { type: "commit", mode: "ai" } });
    expect(
      parseClientMessage(JSON.stringify({ type: "company.create", name: "  Acme  " })),
    ).toEqual({
      type: "company.create",
      name: "Acme",
    });
  });

  test("refuses the development panel's action on the wire", () => {
    for (const type of ["company.act", "round.act"] as const) {
      const message = { type, round: 0, action: { type: "dev_set", values: { money: 1e9 } } };
      expect(parseClientMessage(JSON.stringify(message))).toBeNull();
    }
  });

  test("refuses what is not a message: junk, an unknown type, a short name, a huge frame", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "give.me.money" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "company.create", name: "ab" }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: "ping", padding: "x".repeat(MAX_FRAME_BYTES) })),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ type: "round.act", round: -1, action: { type: "rest" } }),
      ),
    ).toBeNull();
  });

  test("a server frame round-trips and cannot carry a score on an entry", () => {
    const frame = {
      type: "entry.applied",
      seq: 3,
      hash: "deadbeef",
      entry: { kind: "act", seat: 1, action: { type: "buy_point" }, score: 99999 },
    };
    const parsed = parseServerMessage(JSON.stringify(frame));
    expect(parsed).not.toBeNull();
    if (parsed?.type === "entry.applied") expect("score" in parsed.entry).toBe(false);
    expect(
      parseServerMessage(JSON.stringify({ type: "welcome", protocol: PROTOCOL_VERSION })),
    ).toBeNull();
  });
});
