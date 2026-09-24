import { describe, expect, test } from "bun:test";

import { chooseDemo, DEMO_SESSION, DEMO_TEAM, demoDone } from "@/game/bridge/demo";
import { GameSession } from "@/game/bridge/session";
import { toSnapshot } from "@/game/bridge/snapshot";
import { gameStore } from "@/game/bridge/store";
import { checkInvariants, headOf, tipOfLane } from "@/game/core/map/graph";
import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import { createContext } from "@/game/core/rules/context";
import { SHOWCASE_KEEP_ROWS } from "@/game/core/rules/history";
import { raiseQuality } from "@/game/core/rules/quality";
import { payTeam } from "@/game/core/rules/team";
import { createRun } from "@/game/core/run";
import type { RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

/**
 * The landing page plays this run for real, on whatever today's seed is, so
 * the policy has to hold on seeds it has never seen: every move legal, the
 * graph sound at every step, the two seniors on the roster the whole way,
 * and no ending — a showcase cannot lose, whatever the seed does to it.
 */

const SEEDS = Array.from({ length: 30 }, (_, index) => `landing-test-${index}`);
/** The demo never ends on its own; this is how far the tests play it. */
const PLAYED = 160;

function playDemo(seed: string): RunState {
  const session = new GameSession({ ...DEMO_SESSION, seed });
  try {
    for (let played = 0; played < PLAYED; played += 1) {
      const state = session.getState();
      expect(state.devs.map((dev) => dev.rank)).toEqual(["junior", "junior"]);
      const snapshot = toSnapshot(state);
      expect(demoDone(snapshot)).toBe(false);
      const action = chooseDemo(snapshot, played);
      if (action === undefined) throw new Error(`${seed}: nothing to play at action ${played}`);
      const result = session.dispatch(action);
      if (!result.ok) throw new Error(`${seed}: action ${played} refused: ${result.reason}`);
      // Headless there is no scene to play the effects: the queue that would
      // release the session is stood in for here.
      gameStore.setState({ pendingAnimation: false });
      checkInvariants(session.getState());
    }
    return session.getState();
  } finally {
    session.destroy();
  }
}

describe("the landing page's run", () => {
  const runs = SEEDS.map((seed) => ({ seed, state: playDemo(seed) }));

  test("plays the whole demo on every seed, and never ends", () => {
    expect(DEMO_TEAM).toBe(2);
    for (const run of runs) {
      expect(run.state.phase.kind).not.toBe("game_over");
      expect(run.state.turn).toBeGreaterThan(PLAYED / 4);
    }
  });

  test("puts both hands and the team on the graph, and keeps the team busy", () => {
    for (const run of runs) {
      const nodes = Object.values(run.state.nodes);
      const modes = new Set(nodes.map((node) => node.commit.mode));
      expect(modes.has("craft")).toBe(true);
      expect(modes.has("ai")).toBe(true);
      // The board is fed for them: the team writes at least as much as you do.
      const byTeam = nodes.filter((node) => node.commit.author !== undefined).length;
      expect(byTeam).toBeGreaterThan(nodes.length / 3);
    }
  });
});

describe("a showcase that runs for hours", () => {
  // Twelve hundred actions of a real run: longer than the default budget.
  test("forgets what scrolled off, and keeps what the rules still read", () => {
    const session = new GameSession({ ...DEMO_SESSION, seed: "landing-long" });
    let peakNodes = 0;
    let peakTickets = 0;
    for (let played = 0; played < 1200; played += 1) {
      const state = session.getState();
      peakNodes = Math.max(peakNodes, Object.keys(state.nodes).length);
      peakTickets = Math.max(peakTickets, Object.keys(state.tickets).length);
      const action = chooseDemo(toSnapshot(state), played);
      if (action === undefined) throw new Error(`nothing to play at ${played}`);
      const result = session.dispatch(action);
      if (!result.ok) throw new Error(`action ${played} refused: ${result.reason}`);
      gameStore.setState({ pendingAnimation: false });
    }
    const state = session.getState();
    expect(state.nextDepth).toBeGreaterThan(SHOWCASE_KEEP_ROWS * 2);
    // Bounded: a window of rows plus what a sprint holds open.
    expect(peakNodes).toBeLessThan(SHOWCASE_KEEP_ROWS + 150);
    expect(peakTickets).toBeLessThan(200);
    // What the rules still read is there: the trunks' tips, the head, every open ticket's commits.
    expect(tipOfLane(state, MAIN_LANE)).not.toBeNull();
    expect(tipOfLane(state, DEV_LANE)).not.toBeNull();
    expect(state.nodes[headOf(state).id]).toBeDefined();
    for (const ticket of Object.values(state.tickets)) {
      if (ticket.status !== "open") continue;
      for (const id of ticket.nodeIds) expect(state.nodes[id]).toBeDefined();
    }
    session.destroy();
  }, 30_000);
});

describe("a showcase run", () => {
  const showcase = (): RunState =>
    createRun({
      seed: "showcase",
      mode: "daily",
      profileId: "junior",
      version: SAVE_VERSION,
      showcase: { team: ["junior", "junior"], backlog: 8 },
    });

  test("starts with its team, and a plain run starts without one", () => {
    expect(showcase().devs.map((dev) => dev.rank)).toEqual(["junior", "junior"]);
    const plain = createRun({
      seed: "showcase",
      mode: "daily",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    expect(plain.devs).toEqual([]);
    expect(plain.showcase).toBeNull();
  });

  test("cannot be fired, and keeps a developer it cannot pay", () => {
    const state = showcase();
    const context = createContext(state);
    raiseQuality(context, 10_000, "outage");
    expect(state.phase.kind).toBe("choose_action");

    state.money = 0;
    expect(payTeam(context)).toBe(0);
    expect(state.devs).toHaveLength(2);
  });
});
