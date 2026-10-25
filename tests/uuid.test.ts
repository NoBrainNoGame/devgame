import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { randomUuid } from "@/lib/utils/uuid";

describe("randomUuid", () => {
  test("is a v4 UUID the server's clientRunId check accepts", () => {
    for (let i = 0; i < 100; i++) {
      const id = randomUuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(z.uuid().safeParse(id).success).toBe(true);
    }
  });

  test("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, randomUuid));
    expect(ids.size).toBe(1000);
  });
});
