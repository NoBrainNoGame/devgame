import { describe, expect, test } from "bun:test";

import { loginHref, parseReturnPath } from "@/lib/login-return";

const LOCALES = ["fr", "en"] as const;

describe("parseReturnPath", () => {
  test("keeps an in-app path", () => {
    expect(parseReturnPath("/multi", LOCALES)).toBe("/multi");
    expect(parseReturnPath("/multi/play", LOCALES)).toBe("/multi/play");
    expect(parseReturnPath("/profile", LOCALES)).toBe("/profile");
    expect(parseReturnPath("/", LOCALES)).toBe("/");
  });

  test("drops a locale prefix the caller will add back", () => {
    expect(parseReturnPath("/fr/multi", LOCALES)).toBe("/multi");
    expect(parseReturnPath("/en", LOCALES)).toBe("/");
  });

  test("refuses anything that could leave the site", () => {
    for (const raw of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "evil.example",
      "/multi?x=//evil",
      "/a/../../evil",
      "/a%2f%2fevil",
      "",
    ]) {
      expect(parseReturnPath(raw, LOCALES)).toBeNull();
    }
  });

  test("refuses the login page itself and non-strings", () => {
    expect(parseReturnPath("/login", LOCALES)).toBeNull();
    expect(parseReturnPath("/fr/login", LOCALES)).toBeNull();
    expect(parseReturnPath(["/multi"], LOCALES)).toBeNull();
    expect(parseReturnPath(undefined, LOCALES)).toBeNull();
  });
});

describe("loginHref", () => {
  test("carries the page the player came from", () => {
    expect(loginHref("/multi")).toBe("/login?next=%2Fmulti");
    expect(loginHref("/play")).toBe("/login");
    expect(loginHref("/login")).toBe("/login");
  });
});
