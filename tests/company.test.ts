import { describe, expect, test } from "bun:test";

import { getAvailableActions } from "@/game/core/rules/actions";
import { HEAD_OFFICE } from "@/game/core/rules/crew";
import { hashState } from "@/game/core/run";
import type { PlayerAction, RunState, Seat } from "@/game/core/types";
import {
  applyEntry,
  type CompanyEntry,
  type CompanySaveDto,
  CompanySaveSchema,
  replayCompany,
  startCompany,
} from "@/game/dto/company";
import type { PlayerActionDto } from "@/game/dto/run";
import { COMPANY_SAVE_VERSION, CREW_FINGERPRINT, RULES_FINGERPRINT } from "@/game/dto/version";

const BASE: Omit<CompanySaveDto, "entries"> = {
  version: COMPANY_SAVE_VERSION,
  rules: RULES_FINGERPRINT,
  crew: CREW_FINGERPRINT,
  seed: "company-seed",
  name: "Acme",
  founder: "Ada",
  profileId: "junior",
  unlockedSkills: [],
  startingSkillPoints: 0,
};

function pick(
  state: RunState,
  seat: Seat,
  type: PlayerAction["type"],
): Exclude<PlayerActionDto, { type: "dev_set" }> {
  const found = getAvailableActions(state, seat).find((action) => action.type === type);
  if (found === undefined) throw new Error(`seat ${seat} has no ${type}`);
  return found as Exclude<PlayerActionDto, { type: "dev_set" }>;
}

/** A short played company: a join, a start each, a few rounds, one leaving. */
function played(): { save: CompanySaveDto; state: RunState } {
  const entries: CompanyEntry[] = [];
  let state = startCompany(BASE);
  const push = (entry: CompanyEntry): void => {
    entries.push(entry);
    state = applyEntry(state, entry).state;
  };
  push({ kind: "join", name: "Bob", site: HEAD_OFFICE });
  push({ kind: "act", seat: 0, action: pick(state, 0, "start") });
  push({ kind: "act", seat: 1, action: pick(state, 1, "start") });
  for (let i = 0; i < 6; i += 1) {
    push({
      kind: "round",
      actions: {
        0: { type: "commit", mode: "craft" },
        1: i % 2 === 0 ? "missed" : { type: "rest" },
      },
      world: { rivals: [100 + i], ...(i === 3 ? { event: "funding_wave" as const } : {}) },
    });
  }
  push({ kind: "leave", seat: 1 });
  return { save: { ...BASE, entries }, state };
}

describe("a company's log", () => {
  test("replays to exactly the game that was played", () => {
    const { save, state } = played();
    const replay = replayCompany(save);
    if (!replay.valid) throw new Error(replay.error);
    expect(replay.hash).toBe(hashState(state));
    expect(replay.seats.map((s) => [s.seat, s.present])).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  test("replays from a compacted state plus the entries after it", () => {
    const { save } = played();
    const head = replayCompany({ ...save, entries: save.entries.slice(0, 5) });
    if (!head.valid) throw new Error(head.error);
    const tail = replayCompany({ ...save, entries: save.entries.slice(5) }, head.state);
    const whole = replayCompany(save);
    if (!tail.valid || !whole.valid) throw new Error("replay failed");
    expect(tail.hash).toBe(whole.hash);
  });

  test("a score cannot be sent: the schema strips it", () => {
    const { save } = played();
    const parsed = CompanySaveSchema.parse({ ...save, score: 99999 });
    expect("score" in parsed).toBe(false);
    const replay = replayCompany({ ...save, score: 99999 });
    if (!replay.valid) throw new Error(replay.error);
    expect(replay.score).toBeLessThan(99999);
  });

  test("refuses the development panel, an unknown rule and a forged action", () => {
    const { save } = played();
    expect(
      replayCompany({
        ...save,
        entries: [{ kind: "act", seat: 0, action: { type: "dev_set", values: { money: 1e9 } } }],
      }).valid,
    ).toBe(false);
    expect(replayCompany({ ...save, crew: "deadbeef" }).valid).toBe(false);
    const forged = replayCompany({
      ...save,
      entries: [{ kind: "act", seat: 0, action: { type: "buy", id: "orbital_station" } }],
    });
    expect(forged.valid).toBe(false);
  });

  test("refuses a join into a full site and an action for a vacant seat", () => {
    const { save } = played();
    expect(
      replayCompany({ ...save, entries: [{ kind: "join", name: "Zed", site: "nowhere" }] }).valid,
    ).toBe(false);
    expect(
      replayCompany({
        ...save,
        entries: [{ kind: "act", seat: 7, action: { type: "buy_point" } }],
      }).valid,
    ).toBe(false);
  });
});
