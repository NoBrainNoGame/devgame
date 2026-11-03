import { describe, expect, test } from "bun:test";

import { localeOfMagicLink } from "@/lib/email";

const link = (callback: string): string =>
  `https://devgame.example/api/auth/magic-link/verify?token=t&callbackURL=${encodeURIComponent(callback)}`;

describe("localeOfMagicLink", () => {
  test("reads the locale the login page wrote into the callback", () => {
    expect(localeOfMagicLink(link("/en/multi"))).toBe("en");
    expect(localeOfMagicLink(link("/fr/profile"))).toBe("fr");
  });

  test("falls back to the default locale", () => {
    expect(localeOfMagicLink(link("/de/play"))).toBe("fr");
    expect(localeOfMagicLink("https://devgame.example/api/auth/magic-link/verify?token=t")).toBe(
      "fr",
    );
  });
});
