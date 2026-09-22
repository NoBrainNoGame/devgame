import { describe, expect, test } from "bun:test";

import {
  AMBIENT_EVENT_IDS,
  DEV_RANKS,
  FAILURE_EVENT_IDS,
  MERGE_EVENT_IDS,
  PROFILE_IDS,
  RELIC_IDS,
  SKILL_IDS,
  TREE_BRANCHES,
  TREE_IDS,
  UPGRADE_IDS,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import type { NodeKind } from "@/game/core/types";

import en from "../messages/en.json";
import fr from "../messages/fr.json";

/**
 * The engine emits keys, never strings (boundary 10). A missing key is not a
 * typecheck error, it is a raw `log.node_done.ai` shown to a player mid-run —
 * so the two catalogues are checked against each other and against the content
 * tables that name everything the engine can emit.
 */

interface MessageTree {
  [key: string]: string | MessageTree;
}

const FR = fr as unknown as MessageTree;
const EN = en as unknown as MessageTree;

/** Every leaf of a catalogue, as `a.b.c` -> message. */
function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [nested, message] of flatten(value, path)) out.set(nested, message);
  }
  return out;
}

/** ICU placeholder names: `{count, plural, …}` yields `count`, `{#}` yields nothing. */
function placeholders(message: string): Set<string> {
  return new Set(Array.from(message.matchAll(/\{\s*([A-Za-z0-9_]+)/g), (match) => match[1] ?? ""));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

const frFlat = flatten(FR);
const enFlat = flatten(EN);

const NODE_KINDS = Object.keys(BALANCE.energy.cost) as NodeKind[];

describe("catalogues", () => {
  test("fr and en have identical key sets", () => {
    const missingInEn = sorted(frFlat.keys()).filter((key) => !enFlat.has(key));
    const missingInFr = sorted(enFlat.keys()).filter((key) => !frFlat.has(key));

    expect({ missingInEn, missingInFr }).toEqual({ missingInEn: [], missingInFr: [] });
  });

  test("no message is empty", () => {
    const empty = [...frFlat, ...enFlat]
      .filter(([, message]) => message.trim() === "")
      .map(([key]) => key);

    expect(sorted(new Set(empty))).toEqual([]);
  });

  test("fr and en agree on ICU parameter names", () => {
    const mismatched: Record<string, { fr: string[]; en: string[] }> = {};

    for (const [key, message] of frFlat) {
      const other = enFlat.get(key);
      if (other === undefined) continue;

      const here = sorted(placeholders(message));
      const there = sorted(placeholders(other));
      if (here.join(",") !== there.join(",")) mismatched[key] = { fr: here, en: there };
    }

    expect(mismatched).toEqual({});
  });
});

describe("game content is fully named", () => {
  const cases: ReadonlyArray<[string, readonly string[], string, string]> = [
    ["skills", SKILL_IDS, "name", "desc"],
    ["relics", RELIC_IDS, "name", "desc"],
    ["tree", TREE_IDS, "name", "desc"],
    ["upgrades", UPGRADE_IDS, "name", "desc"],
    ["profiles", PROFILE_IDS, "name", "desc"],
    ["events", FAILURE_EVENT_IDS, "title", "log"],
    ["events", MERGE_EVENT_IDS, "title", "log"],
    ["events", AMBIENT_EVENT_IDS, "title", "log"],
  ];

  for (const [namespace, ids, label, body] of cases) {
    test(`${namespace}: ${ids.join(", ")}`, () => {
      const expected = ids.flatMap((id) => [
        `game.${namespace}.${id}.${label}`,
        `game.${namespace}.${id}.${body}`,
      ]);

      expect(expected.filter((key) => !frFlat.has(key))).toEqual([]);
      expect(expected.filter((key) => !enFlat.has(key))).toEqual([]);
    });
  }

  // Branches and ranks are labels, not things with a description.
  const named: ReadonlyArray<[string, readonly string[]]> = [
    ["branches", TREE_BRANCHES],
    ["ranks", DEV_RANKS],
  ];

  for (const [namespace, ids] of named) {
    test(`${namespace} are named: ${ids.join(", ")}`, () => {
      const expected = ids.map((id) => `game.${namespace}.${id}.name`);
      expect(expected.filter((key) => !frFlat.has(key))).toEqual([]);
      expect(expected.filter((key) => !enFlat.has(key))).toEqual([]);
    });
  }

  test("every node kind is named", () => {
    const expected = NODE_KINDS.flatMap((kind) => [
      `game.nodes.${kind}.name`,
      `game.nodes.${kind}.desc`,
    ]);

    expect(expected.filter((key) => !frFlat.has(key))).toEqual([]);
    expect(expected.filter((key) => !enFlat.has(key))).toEqual([]);
  });
});

describe("french typography", () => {
  test("double punctuation is preceded by a non-breaking space", () => {
    // `:` `;` `!` `?` `%` and `»` take an unbreakable space in French. With an
    // ordinary one the mark wraps onto a line of its own, which in a narrow
    // tooltip reads as a stray ":" hanging under the sentence it belongs to.
    const offenders: string[] = [];

    for (const [key, value] of frFlat) {
      if (typeof value !== "string") continue;
      if (/ [:;!?%»]/.test(value)) offenders.push(`${key}: ${value}`);
      if (/« /.test(value)) offenders.push(`${key}: ${value}`);
    }

    expect(offenders).toEqual([]);
  });
});
