import { describe, expect, test } from "bun:test";

import { toSnapshot } from "@/game/bridge/snapshot";
import { CREW_BALANCE } from "@/game/core/balance";
import { getAvailableActions } from "@/game/core/rules/actions";
import {
  HEAD_OFFICE,
  leadSeat,
  occupiedSeats,
  phaseOf,
  playerOf,
  siteMembers,
  siteView,
  ticketVisibleAt,
} from "@/game/core/rules/crew";
import { applyAction, applyRound, joinCrew, leaveCrew } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import { computeScore, playerScore } from "@/game/core/score";
import type { PlayerAction, RunState, Seat } from "@/game/core/types";
import { InvalidActionError } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

function company(seed = "crew-1"): RunState {
  return createRun({
    seed,
    mode: "multiplayer",
    profileId: "junior",
    version: SAVE_VERSION,
    crew: { name: "Acme", founder: "Ada" },
  });
}

function withTwo(seed = "crew-1"): RunState {
  return joinCrew(company(seed), { name: "Bob", site: HEAD_OFFICE }).state;
}

function pick(state: RunState, seat: Seat, type: PlayerAction["type"]): PlayerAction {
  const found = getAvailableActions(state, seat).find((action) => action.type === type);
  if (found === undefined) throw new Error(`seat ${seat} has no ${type}`);
  return found;
}

function start(state: RunState, seat: Seat): RunState {
  return applyAction(state, pick(state, seat, "start"), seat).state;
}

const noWorld = { rivals: [] };

describe("a company", () => {
  test("starts with its founder at the head office and no solo player", () => {
    const state = company();
    expect(state.mode).toBe("multiplayer");
    expect(state.player).toBeUndefined();
    expect(occupiedSeats(state)).toEqual([0]);
    expect(state.crew?.seats[0]?.name).toBe("Ada");
    expect(state.market.rivals).toEqual([]);
    expect(playerOf(state, 0).energy).toBe(playerOf(state, 0).energyMax);
  });

  test("a run is a company or it is solo, never both", () => {
    expect(() =>
      createRun({
        seed: "x",
        mode: "classic",
        profileId: "junior",
        version: 3,
        crew: { name: "a", founder: "b" },
      }),
    ).toThrow();
    expect(() =>
      createRun({ seed: "x", mode: "multiplayer", profileId: "junior", version: 3 }),
    ).toThrow();
  });

  test("seats are numbered in order and never reused", () => {
    const joined = withTwo();
    expect(occupiedSeats(joined)).toEqual([0, 1]);
    const left = leaveCrew(joined, 0).state;
    expect(occupiedSeats(left)).toEqual([1]);
    const again = joinCrew(left, { name: "Cy", site: HEAD_OFFICE }).state;
    expect(occupiedSeats(again)).toEqual([1, 2]);
    expect(leadSeat(again)).toBe(1);
    expect(again.crew?.left[0]?.name).toBe("Ada");
  });

  test("a full site refuses a newcomer", () => {
    let state = company();
    state = joinCrew(state, { name: "B", site: HEAD_OFFICE }).state;
    state = joinCrew(state, { name: "C", site: HEAD_OFFICE }).state;
    expect(() => joinCrew(state, { name: "D", site: HEAD_OFFICE })).toThrow(InvalidActionError);
    expect(() => joinCrew(state, { name: "D", site: "nowhere" })).toThrow(InvalidActionError);
    expect(siteMembers(state, HEAD_OFFICE)).toEqual([0, 1, 2]);
  });
});

describe("free actions", () => {
  test("starting a ticket gives it to the seat that started it", () => {
    const state = start(withTwo(), 1);
    const held = Object.values(state.tickets).filter((t) => t.holder === 1 && t.status === "open");
    expect(held).toHaveLength(1);
    expect(playerOf(state, 1).ticketId).toBe(held[0]?.id ?? null);
    expect(playerOf(state, 0).ticketId).toBeNull();
  });

  test("a seat cannot touch another seat's ticket", () => {
    const state = start(withTwo(), 1);
    const checkouts = getAvailableActions(state, 0).filter((a) => a.type === "checkout");
    expect(checkouts).toHaveLength(0);
  });

  test("a turn action is refused outside a round", () => {
    const state = start(company(), 0);
    expect(() => applyAction(state, { type: "commit", mode: "craft" }, 0)).toThrow(
      InvalidActionError,
    );
  });
});

describe("a round", () => {
  test("applies every seat in order and advances the clock one turn", () => {
    let state = withTwo();
    state = start(state, 0);
    state = start(state, 1);
    const result = applyRound(state, {
      actions: { 0: { type: "commit", mode: "craft" }, 1: { type: "commit", mode: "craft" } },
      world: noWorld,
    });
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.outcomes).toEqual({ 0: "acted", 1: "acted" });
    const authors = Object.values(result.state.nodes)
      .filter((node) => node.commit.seat !== undefined)
      .map((node) => node.commit.seat);
    expect(authors).toEqual([0, 1]);
  });

  test("is deterministic: same state and same input give the same game", () => {
    let state = withTwo("det");
    state = start(start(state, 0), 1);
    const input = {
      actions: { 0: { type: "commit", mode: "ai" }, 1: { type: "commit", mode: "craft" } },
      world: { rivals: [120, 40] },
    } as const;
    const a = applyRound(state, input);
    const b = applyRound(state, input);
    expect(b.state).toEqual(a.state);
  });

  test("a missed round gives no energy back and costs patience", () => {
    let state = withTwo();
    state = start(state, 0);
    const before = playerOf(state, 0).energy;
    const result = applyRound(state, { actions: { 0: "missed", 1: "missed" }, world: noWorld });
    expect(result.outcomes[0]).toBe("missed");
    expect(playerOf(result.state, 0).energy).toBe(before);
    // Seat 1 could have started a ticket: it missed too, and each miss costs.
    expect(result.outcomes[1]).toBe("missed");
    expect(result.state.quality).toBe(state.quality + 2 * CREW_BALANCE.crew.missPatience);
  });

  test("a seat with nothing to hold and nothing to start just passes", () => {
    const state = structuredClone(withTwo());
    for (const ticket of Object.values(state.tickets)) {
      if (ticket.status === "backlog") ticket.status = "cancelled";
    }
    const result = applyRound(state, { actions: { 0: "missed", 1: "missed" }, world: noWorld });
    expect(result.outcomes).toEqual({ 0: "passed", 1: "passed" });
    expect(result.events.some((event) => event.type === "seat_missed")).toBe(false);
  });

  test("a choice an earlier seat made illegal is skipped without penalty", () => {
    let state = withTwo();
    state = start(state, 0);
    const result = applyRound(state, {
      actions: { 0: { type: "commit", mode: "craft" }, 1: { type: "commit", mode: "craft" } },
      world: noWorld,
    });
    // Seat 1 has no ticket in hand, so its commit was never legal.
    expect(result.outcomes[1]).toBe("skipped");
  });

  test("refuses to run while the company is deciding", () => {
    const state = structuredClone(company());
    state.phase = { kind: "choose_relic", offer: [] };
    expect(() => applyRound(state, { actions: {}, world: noWorld })).toThrow(InvalidActionError);
  });

  test("rivals set the share: a bigger world leaves a smaller share", () => {
    const alone = applyRound(company(), { actions: { 0: "missed" }, world: { rivals: [] } });
    const crowded = applyRound(company(), { actions: { 0: "missed" }, world: { rivals: [900] } });
    expect(crowded.state.market.rivals).toEqual([900]);
    expect(alone.state.market.rivals).toEqual([]);
  });

  test("a world event reaches the company", () => {
    const hit = applyRound(company(), {
      actions: { 0: "missed" },
      world: { rivals: [], event: "heat_wave" },
    });
    expect(hit.events.some((event) => event.type === "world_event")).toBe(true);
    expect(playerOf(hit.state, 0).energy).toBeLessThan(playerOf(company(), 0).energy);
  });

  test("burnout frees the seat, and the last one dissolves the company", () => {
    let state = withTwo();
    // Seat 1 sits at zero energy with a ticket in hand it cannot afford to write.
    state = structuredClone(state);
    playerOf(state, 1).energy = 0;
    playerOf(state, 1).zeroEnergyStreak = 1;
    let result = applyRound(state, { actions: { 0: "missed", 1: "missed" }, world: noWorld });
    expect(occupiedSeats(result.state)).toEqual([0]);
    expect(result.state.crew?.left[1]?.name).toBe("Bob");

    const lonely = structuredClone(result.state);
    playerOf(lonely, 0).energy = 0;
    playerOf(lonely, 0).zeroEnergyStreak = 1;
    result = applyRound(lonely, { actions: { 0: "missed" }, world: noWorld });
    expect(result.state.phase.kind).toBe("game_over");
    expect(result.state.phase.kind === "game_over" && result.state.phase.reason).toBe("dissolved");
  });

  test("leaving hands the work to the lightest desk", () => {
    let state = withTwo();
    state = start(state, 1);
    const ticketId = playerOf(state, 1).ticketId;
    const left = leaveCrew(state, 1).state;
    expect(left.tickets[ticketId ?? ""]?.holder).toBe(0);
    expect(playerOf(left, 0).ticketId).toBe(ticketId);
  });
});

describe("a company's score", () => {
  test("counts the commits of everybody, and each human's own part", () => {
    let state = withTwo();
    state = start(start(state, 0), 1);
    const result = applyRound(state, {
      actions: { 0: { type: "commit", mode: "craft" }, 1: { type: "commit", mode: "craft" } },
      world: noWorld,
    });
    const landed = (seat: Seat): number => playerOf(result.state, seat).totalCommits;
    expect(result.state.crew?.commits).toBe(landed(0) + landed(1));
    expect(computeScore(result.state)).toBeGreaterThanOrEqual(result.state.crew?.commits ?? 0);
    expect(playerScore(result.state, 0)).toBe(landed(0));
  });

  test("a leaver's part is frozen", () => {
    const state = withTwo();
    const left = leaveCrew(state, 1).state;
    expect(playerScore(left, 1)).toBe(0);
  });
});

describe("the phase of a seat", () => {
  test("a pending question belongs to one seat only", () => {
    const state = withTwo();
    expect(phaseOf(state, 0).kind).toBe("choose_action");
    const asked = structuredClone(state);
    const seat = asked.crew?.seats[0];
    if (seat === undefined) throw new Error("no seat");
    seat.pending = { kind: "ticket_rejected", ticketId: "t1", bugs: 1 };
    expect(phaseOf(asked, 0).kind).toBe("ticket_rejected");
    expect(phaseOf(asked, 1).kind).toBe("choose_action");
  });
});

describe("a company's snapshot", () => {
  test("each human reads the company from their own desk", () => {
    const state = start(withTwo(), 1);
    const mine = toSnapshot(state, 1);
    const theirs = toSnapshot(state, 0);
    expect(mine.crew?.mySeat).toBe(1);
    expect(theirs.crew?.mySeat).toBe(0);
    expect(mine.player.ticketId).not.toBeNull();
    expect(theirs.player.ticketId).toBeNull();
    expect(mine.crew?.seats.map((seat) => seat.name)).toEqual(["Ada", "Bob"]);
    expect(mine.crew?.sites[0]).toMatchObject({ id: "hq", used: 2 });
    expect(mine.tickets.find((ticket) => ticket.holder === 1)).toBeDefined();
    expect(mine.companyPhase.kind).toBe("choose_action");
  });

  test("a solo snapshot has no company", () => {
    const solo = createRun({
      seed: "s",
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    expect(toSnapshot(solo, 0).crew).toBeUndefined();
  });
});

describe("a site's view", () => {
  /** Two sites, one human each, a commit apiece. */
  function twoSites(): RunState {
    let state = structuredClone(company());
    if (state.crew === undefined) throw new Error("no crew");
    state.crew.sites["office-1"] = { upgrade: "office", seats: 4 };
    state = joinCrew(state, { name: "Bob", site: "office-1" }).state;
    state = start(start(state, 0), 1);
    return applyRound(state, {
      actions: { 0: { type: "commit", mode: "craft" }, 1: { type: "commit", mode: "craft" } },
      world: noWorld,
    }).state;
  }

  test("shows the trunks and its own people's branches, and nobody else's", () => {
    const state = twoSites();
    const authors = (view: RunState): Seat[] =>
      Object.values(view.nodes).flatMap((node) =>
        node.commit.seat === undefined ? [] : [node.commit.seat],
      );
    expect(authors(state).sort()).toEqual([0, 1]);
    expect(authors(siteView(state, HEAD_OFFICE))).toEqual([0]);
    expect(authors(siteView(state, "office-1"))).toEqual([1]);
    // The trunks are everyone's.
    const trunk = (view: RunState): number =>
      Object.values(view.nodes).filter((node) => node.lane <= 1).length;
    expect(trunk(siteView(state, HEAD_OFFICE))).toBe(trunk(state));
  });

  test("leaves no node pointing at a parent that is not there", () => {
    const state = twoSites();
    for (const site of [HEAD_OFFICE, "office-1"]) {
      const view = siteView(state, site);
      for (const node of Object.values(view.nodes)) {
        for (const parent of node.parents) expect(view.nodes[parent]).toBeDefined();
      }
      for (const ticket of Object.values(view.tickets)) {
        for (const id of ticket.nodeIds) expect(view.nodes[id]).toBeDefined();
      }
    }
  });

  test("the board is the company's backlog and the site's own open tickets", () => {
    const state = twoSites();
    const mine = Object.values(state.tickets).filter((ticket) =>
      ticketVisibleAt(state, ticket, HEAD_OFFICE),
    );
    expect(mine.some((ticket) => ticket.holder === 1)).toBe(false);
    expect(mine.some((ticket) => ticket.holder === 0)).toBe(true);
    const fresh = company();
    const backlog = Object.values(fresh.tickets).filter((ticket) => ticket.status === "backlog");
    expect(backlog.length).toBeGreaterThan(0);
    expect(backlog.every((ticket) => ticketVisibleAt(fresh, ticket, "anywhere"))).toBe(true);
  });

  test("solo is its own view", () => {
    const solo = createRun({
      seed: "s",
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    expect(siteView(solo, HEAD_OFFICE)).toBe(solo);
  });
});
