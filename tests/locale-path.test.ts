import { describe, expect, test } from "bun:test";

import { localizedPath } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo";

describe("localizedPath", () => {
  test("French, the default, has no prefix", () => {
    expect(localizedPath("fr", "/multi")).toBe("/multi");
    expect(localizedPath("fr", "")).toBe("/");
    expect(localizedPath("fr", "/")).toBe("/");
  });

  test("English keeps its prefix", () => {
    expect(localizedPath("en", "/multi")).toBe("/en/multi");
    expect(localizedPath("en", "")).toBe("/en");
    expect(localizedPath("en", "/")).toBe("/en");
  });

  test("canonical URLs follow", () => {
    expect(siteUrl("https://devgame.example", "fr", "/play")).toBe("https://devgame.example/play");
    expect(siteUrl("https://devgame.example", "en")).toBe("https://devgame.example/en");
  });
});
