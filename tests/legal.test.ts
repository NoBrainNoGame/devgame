import { describe, expect, test } from "bun:test";

import { STORAGE_KEYS } from "@/lib/storage/keys";

import en from "../messages/en.json";
import fr from "../messages/fr.json";

/**
 * The legal pages render placeholders — `TODO_PUBLISHER_NAME` and friends —
 * because the repository does not know who publishes the site. Two things go
 * wrong when somebody fills them in, and neither shows up in a typecheck:
 * filling only one catalogue, and leaving a half-edited token behind.
 *
 * `tests/messages.test.ts` already proves the two files have the same keys.
 * This file is about the values.
 */

const PLACEHOLDER = /^TODO_[A-Z0-9_]+$/;

describe("legal identity fields", () => {
  test("fr and en carry the same values", () => {
    // A company name, an address and a SIREN are not translated. Diverging
    // values here mean the operator edited one file and forgot the other,
    // which is how a site ends up with two different publishers.
    expect(en.legal.publisher).toEqual(fr.legal.publisher);
  });

  test("every unfilled value is a whole TODO token", () => {
    const halfEdited = Object.entries(fr.legal.publisher)
      .filter(([, value]) => value.includes("TODO") && !PLACEHOLDER.test(value))
      .map(([key]) => key);

    expect(halfEdited).toEqual([]);
  });

  test("a placeholder is never mistaken for a real value", () => {
    // Mirrors `isPlaceholder` in the legal pages: what that function accepts is
    // exactly what gets rendered in red.
    expect(PLACEHOLDER.test("TODO_PUBLISHER_NAME")).toBe(true);
    expect(PLACEHOLDER.test("Sociétée TODO")).toBe(false);
    expect(PLACEHOLDER.test("contact@example.com")).toBe(false);
  });
});

describe("the privacy page", () => {
  test("names every localStorage key the app writes, in both languages", () => {
    // The page went stale twice on renamed keys; this is the drift it catches.
    for (const catalogue of [fr, en]) {
      const text = (catalogue as { legal: { privacy: { offlineP1: string } } }).legal.privacy
        .offlineP1;
      for (const key of Object.values(STORAGE_KEYS)) expect(text).toContain(key);
    }
  });
});
