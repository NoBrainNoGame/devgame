import { toSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { RELICS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { fnv1a } from "@/game/core/hash";
import { energyMax } from "@/game/core/rules/modifiers";
import {
  buggedOn,
  currentTicket,
  getTicket,
  obstaclesOf,
  playerTickets,
  unreadAiOn,
  waitsOnlyForHealth,
  waitsOnlyForObstacle,
} from "@/game/core/rules/tickets";
import type { PlayerAction, RunState } from "@/game/core/types";

import { manage, TREE_ORDER } from "./policy";

/**
 * The headless player who is a person, not a strategy.
 *
 * The four fixed policies each press the buttons one way, forever, without a
 * slip. Nobody plays like that. This one draws a *persona* per run — how much
 * the machine tempts them, whether they read before they submit, when they
 * notice they are tired, how many things they take on at once, how often
 * they press the wrong thing, and how much of the run they leave to the idle
 * clock — and then plays it with the mistakes that persona makes. Three
 * hundred seeds are three hundred different players, from the one who
 * lets the machine write everything and never reads it to the one who
 * refactors at the first sign of debt.
 *
 * Every trait is a number in [0, 1]; the persona is a pure function of the
 * seed, and every decision's dice are a pure function of the seed and of
 * where the run stands, so a human run replays like any other. The engine's
 * own PRNG is never touched.
 */

export interface Persona {
  /** How often a plain commit goes to the machine. */
  aiTaste: number;
  /** How often unread machine work gets read before it is submitted or piles up. */
  reviewDiscipline: number;
  /** How early tiredness is noticed: high rests at four energy, low at one. */
  energyCare: number;
  /** How early debt is refactored: high at thirty, low never. */
  debtCare: number;
  /** Second tickets taken while one is open, risky commits, the hack. */
  greed: number;
  /** How rarely the wrong button is pressed. */
  attention: number;
  /** Share of ordinary turns handed to the idle clock. */
  idleShare: number;
}

/** A 32-bit generator, seeded from a hash, for the player's own dice. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two uniforms averaged: most people are middling, a few are extreme. */
function trait(next: () => number): number {
  return (next() + next()) / 2;
}

export function personaOf(seed: string): Persona {
  const next = mulberry(fnv1a(`persona:${seed}`));
  return {
    aiTaste: trait(next),
    reviewDiscipline: trait(next),
    energyCare: trait(next),
    debtCare: trait(next),
    greed: trait(next),
    attention: trait(next),
    // Most players press the buttons themselves most of the time.
    idleShare: trait(next) * 0.6,
  };
}

/** One number for the buckets in the report: how much this player pays attention. */
export function carefulness(persona: Persona): number {
  const { reviewDiscipline, energyCare, debtCare, attention, greed } = persona;
  return (reviewDiscipline + energyCare + debtCare + attention + (1 - greed)) / 5;
}

export function bucketOf(persona: Persona): "careless" | "average" | "careful" {
  const care = carefulness(persona);
  return care < 0.42 ? "careless" : care > 0.58 ? "careful" : "average";
}

export function chooseHuman(state: RunState, actions: PlayerAction[]): PlayerAction {
  const persona = personaOf(state.seed);
  // Fresh dice for every decision, from where the run stands: the same
  // decision in the same state rolls the same, so a run replays.
  const next = mulberry(
    fnv1a(`${state.seed}:${state.turn}:${state.log.length}:${state.phase.kind}`),
  );
  const chance = (p: number): boolean => next() < p;
  const find = (predicate: (a: PlayerAction) => boolean): PlayerAction | undefined =>
    actions.find(predicate);
  const commit = (mode: "craft" | "ai", kind?: string) =>
    find((a) => a.type === "commit" && a.mode === mode && a.kind === kind);

  // Questions with one answer, or a question to answer: nobody dithers here.
  if (state.phase.kind === "pr_accepted") return { type: "merge" };
  if (state.phase.kind === "ticket_rejected") {
    // Shipping the bugs anyway is the greedy way out; the rest fix them.
    return chance(persona.greed * 0.5) ? { type: "followup" } : { type: "resume" };
  }
  if (state.phase.kind === "resolve_conflict") {
    const tired = state.player.energy <= BALANCE.failure.conflictManualEnergy;
    return {
      type: "resolve_conflict",
      how: tired || chance(persona.aiTaste * 0.5) ? "ai" : "manual",
    };
  }
  if (state.phase.kind === "event") {
    const answers = actions.filter((a) => a.type === "answer");
    return answers[Math.floor(next() * answers.length)] ?? actions[0] ?? { type: "rest" };
  }
  if (state.phase.kind === "choose_relic") {
    const offered = actions.filter((a) => a.type === "choose_relic");
    // A keep is read as the good card by most; the rest pick what shines.
    const keep = offered.find((a) => RELICS[a.relicId].kind === "keep");
    if (keep !== undefined && chance(0.5 + persona.attention * 0.4)) return keep;
    return offered[Math.floor(next() * offered.length)] ?? actions[0] ?? { type: "rest" };
  }

  // Free moves: points and money. Careful players place points at once;
  // the others get round to it.
  if (chance(0.4 + persona.attention * 0.6)) {
    const tree = TREE_ORDER.map((id) => find((a) => a.type === "tree" && a.id === id)).find(
      (a) => a !== undefined,
    );
    if (tree !== undefined) return tree;
    const bought = manage(state, actions);
    if (bought !== undefined && chance(0.5 + persona.greed * 0.5)) return bought;
  }

  const ticket = currentTicket(state);
  const hack = find((a) => a.type === "hack");
  // A coin flip for the run: the greedy take it about half the time.
  if (hack !== undefined && chance(persona.greed * 0.5)) return hack;

  // Nothing in hand: the first ticket that looks good enough.
  if (ticket === null) {
    const starts = actions.filter((a) => a.type === "start");
    const teaching = starts.find((a) => getTicket(state, a.ticketId).skillId !== undefined);
    if (teaching !== undefined && chance(0.5 + persona.attention * 0.5)) return teaching;
    const start = starts[Math.floor(next() * starts.length)];
    if (start !== undefined) return start;
    const checkout = find((a) => a.type === "checkout");
    if (checkout !== undefined) return checkout;
    return find((a) => a.type === "rest") ?? actions[0] ?? { type: "rest" };
  }

  // The idle clock plays some of the turns: the player is watching, or away.
  if (chance(persona.idleShare)) {
    const move = chooseSupervisor(toSnapshot(state))?.action;
    if (move !== undefined && actions.some((a) => sameAction(a, move))) return move;
  }

  // A slip: the wrong button among the ones that cost a turn.
  if (chance((1 - persona.attention) * 0.08)) {
    const costly = actions.filter((a) => a.type === "commit" || a.type === "rest");
    const slip = costly[Math.floor(next() * costly.length)];
    if (slip !== undefined) return slip;
  }

  // What the ticket demands before anything else.
  if (buggedOn(state, ticket).length > 0) {
    const fix = commit("craft", "fix") ?? commit("ai", "fix");
    if (fix !== undefined) return fix;
  }
  if (waitsOnlyForObstacle(state, ticket)) {
    for (const obstacle of obstaclesOf(state, ticket)) {
      const go = find((a) => a.type === "checkout" && a.ticketId === obstacle.id);
      if (go !== undefined) return go;
    }
  }
  if (waitsOnlyForHealth(state, ticket)) {
    const refactor = commit("craft", "refactor");
    if (refactor !== undefined) return refactor;
    // Somewhere else to work, that is not itself held back the same way.
    const stuck = (id: string): boolean => {
      const other = getTicket(state, id);
      return waitsOnlyForHealth(state, other) || waitsOnlyForObstacle(state, other);
    };
    const elsewhere =
      find((a) => a.type === "checkout" && !stuck(a.ticketId)) ??
      find((a) => a.type === "start" && getTicket(state, a.ticketId).kind === "debt") ??
      find((a) => a.type === "start") ??
      find((a) => a.type === "rest");
    if (elsewhere !== undefined) return elsewhere;
  }

  const unread = unreadAiOn(state, ticket).length;
  const submit = find((a) => a.type === "submit");
  const review = find((a) => a.type === "review");
  if (submit !== undefined) {
    if (unread > 0 && review !== undefined && chance(persona.reviewDiscipline)) return review;
    return submit;
  }

  // Tired: the careful notice at four, the careless at one. And the tired
  // reach for the machine, which is the trap the game sets.
  const restAt = 1 + Math.round(persona.energyCare * 3);
  const energy = state.player.energy;
  if (energy <= restAt) {
    const rest = find((a) => a.type === "rest");
    if (rest !== undefined && chance(0.3 + persona.energyCare * 0.6)) return rest;
    const ai = commit("ai");
    if (ai !== undefined && chance(0.5 + persona.aiTaste * 0.5)) return ai;
  }

  // Debt: the careful refactor at thirty, the careless at sixty, some never.
  const refactorAt = 60 - Math.round(persona.debtCare * 30);
  if (state.debt >= refactorAt && persona.debtCare > 0.2) {
    const refactor = commit("craft", "refactor");
    if (refactor !== undefined && chance(persona.debtCare)) return refactor;
  }

  // Unread machine work piling up: read it, if that is a thing this player does.
  const readAt = 2 + Math.round((1 - persona.reviewDiscipline) * 4);
  if (unread >= readAt && review !== undefined && chance(persona.reviewDiscipline)) return review;

  // Greed: a second ticket while one is open, when the backlog offers one.
  if (playerTickets(state).length < 3 && chance(persona.greed * 0.08)) {
    const starts = actions.filter((a) => a.type === "start");
    const start = starts[Math.floor(next() * starts.length)];
    if (start !== undefined) return start;
  }

  // Docs before a stretch of machine work, for the ones who know the trick.
  if (state.player.docsCharges === 0 && persona.aiTaste > 0.5 && chance(persona.attention * 0.25)) {
    const docs = commit("craft", "docs");
    if (docs !== undefined) return docs;
  }

  // The commit itself: which hand, and whether it is a gamble.
  const tired = energy < energyMax(state) * 0.3;
  const aiChance = Math.min(0.95, persona.aiTaste + (tired ? 0.2 : 0));
  const mode = chance(aiChance) ? "ai" : "craft";
  if (chance(persona.greed * 0.25)) {
    const risky = commit(mode, "risky");
    if (risky !== undefined) return risky;
  }
  return (
    commit(mode) ??
    commit(mode === "ai" ? "craft" : "ai") ??
    find((a) => a.type === "commit") ??
    review ??
    find((a) => a.type === "rest") ??
    actions[0] ?? { type: "rest" }
  );
}

function sameAction(a: PlayerAction, b: PlayerAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
