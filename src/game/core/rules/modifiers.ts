import {
  addEffects,
  DEVOPS,
  DEVOPS_IDS,
  type Effects,
  NO_EFFECTS,
  PROFILES,
  RELICS,
  SKILLS,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { type I18nText, text } from "@/game/core/i18n";
import type { Branch, CommitMode, MapNode, RunState } from "@/game/core/types";

/**
 * The single place that turns "what the player has" into "what the numbers
 * are". Every chance, every cost and every cap is computed here, so a rule
 * module never has to remember that the Vibe Coder is bad at craft commits or
 * that CI is worth five points a level.
 *
 * Each function returns its notes alongside its value: the HUD shows the player
 * exactly why a roll is 63 % and not 70 %, which is the whole point of showing
 * the odds at all.
 */

export interface Breakdown {
  value: number;
  notes: I18nText[];
}

export function gatherEffects(state: RunState): Effects {
  const effects: Effects = { ...NO_EFFECTS };

  addEffects(effects, PROFILES[state.profileId].effects);

  // Levels bought between runs. They are effects like any other, so nothing
  // downstream has to know the meta-progression exists.
  addEffects(effects, {
    energyMaxBonus: state.statPoints.energyMax,
    allSuccessPoints: state.statPoints.luck,
    conflictResistancePoints: state.statPoints.conflictRes,
  });

  for (const skillId of [...state.skills].sort()) {
    addEffects(effects, SKILLS[skillId].effects);
  }
  for (const relicId of [...state.relics].sort()) {
    addEffects(effects, RELICS[relicId].effects);
  }
  for (const devopsId of DEVOPS_IDS) {
    const level = state.devops[devopsId] ?? 0;
    for (let i = 0; i < level; i++) addEffects(effects, DEVOPS[devopsId].perLevel);
  }

  return effects;
}

export function energyMax(state: RunState, effects = gatherEffects(state)): number {
  return BALANCE.energy.base + effects.energyMaxBonus;
}

/** Low energy hurts every roll, and says so before you spend it. */
export function isCrunch(state: RunState): boolean {
  return state.player.energy <= BALANCE.energy.crunchThreshold;
}

/** Feature branches the player has stepped onto and not yet merged. */
export function openBranches(state: RunState): Branch[] {
  return Object.keys(state.branches)
    .sort()
    .map((id) => state.branches[id])
    .filter((branch): branch is Branch => branch !== undefined)
    .filter((branch) => branch.open && !branch.merged)
    .filter((branch) => branch.kind === "feature" || branch.kind === "subfeature");
}

/** Working two features at once is allowed, and it costs you on both. */
export function isOverextended(state: RunState): boolean {
  return openBranches(state).length >= 2;
}

/**
 * Share of recent AI commits that have been read by a human. Drives both the
 * Reviewer bot's patience and the quality half of the reputation formula.
 * With nothing unread, the ratio is a perfect 1.
 */
export function reviewedRatio(state: RunState): number {
  const history = state.player.aiHistory;
  if (history.length === 0) return 1;
  const reviewed = history.filter((entry) => entry.reviewed).length;
  return reviewed / history.length;
}

/**
 * Success chance for resolving `node` with a given commit mode, in percent,
 * already clamped. `risky` nodes replace the base chance rather than adding to
 * it: they are a different kind of gamble, not a worse commit.
 */
export function commitChance(
  state: RunState,
  mode: CommitMode,
  node: MapNode,
  effects = gatherEffects(state),
): Breakdown {
  const notes: I18nText[] = [];
  const { commit } = BALANCE;

  let value: number = node.kind === "risky" ? commit.riskyBase : commit.base[mode];

  const perMode =
    node.kind === "risky"
      ? effects.riskySuccessPoints
      : mode === "ai"
        ? effects.aiSuccessPoints
        : effects.craftSuccessPoints;

  if (perMode !== 0) {
    value += perMode;
    notes.push(text("notes.build", { points: signed(perMode) }));
  }

  if (effects.allSuccessPoints !== 0) {
    value += effects.allSuccessPoints;
    notes.push(text("notes.automation", { points: signed(effects.allSuccessPoints) }));
  }

  const debtMalus = Math.floor(state.debt / commit.debtRiskDivisor);
  if (debtMalus > 0) {
    value -= debtMalus;
    notes.push(text("notes.debt", { points: signed(-debtMalus) }));
  }

  if (isCrunch(state)) {
    value -= BALANCE.energy.crunchMalusPoints;
    notes.push(text("notes.crunch", { points: signed(-BALANCE.energy.crunchMalusPoints) }));
  }

  if (isOverextended(state)) {
    value -= commit.secondBranchMalusPoints;
    notes.push(text("notes.overextended", { points: signed(-commit.secondBranchMalusPoints) }));
  }

  return { value: clampChance(value), notes };
}

/** Chance of untangling a merge conflict by hand rather than asking the machine. */
export function conflictChance(state: RunState, effects = gatherEffects(state)): Breakdown {
  const notes: I18nText[] = [];
  let value: number = BALANCE.failure.conflictManualBase;

  if (effects.conflictResistancePoints !== 0) {
    value += effects.conflictResistancePoints;
    notes.push(text("notes.build", { points: signed(effects.conflictResistancePoints) }));
  }
  if (isCrunch(state)) {
    value -= BALANCE.energy.crunchMalusPoints;
    notes.push(text("notes.crunch", { points: signed(-BALANCE.energy.crunchMalusPoints) }));
  }

  return { value: clampChance(value), notes };
}

/**
 * Energy to resolve `node`. `mode` is absent for nodes that are walked rather
 * than committed to — a merge, a release.
 */
export function nodeEnergyCost(
  state: RunState,
  node: MapNode,
  mode: CommitMode | undefined,
  effects = gatherEffects(state),
): Breakdown {
  const notes: I18nText[] = [];
  let value: number = BALANCE.energy.cost[node.kind];

  if (mode !== undefined) value += BALANCE.energy.commitCost[mode];

  if (node.kind === "refactor" && state.player.freeRefactor) {
    value = 0;
    notes.push(text("notes.free_refactor"));
    return { value, notes };
  }

  if (node.kind === "feature_merge" || node.kind === "sprint_merge") {
    const discounted = Math.max(0, value - effects.mergeEnergyDiscount);
    if (discounted !== value) {
      notes.push(text("notes.merge_free"));
      value = discounted;
    }
  }

  if (isOverextended(state)) {
    value *= BALANCE.energy.secondBranchCostMultiplier;
    notes.push(text("notes.overextended_cost"));
  }

  return { value, notes };
}

export function reviewEnergyCost(state: RunState, effects = gatherEffects(state)): Breakdown {
  const notes: I18nText[] = [];
  let value: number = BALANCE.energy.reviewCost;

  if (effects.reviewEnergyDiscount > 0) {
    value = Math.max(0, value - effects.reviewEnergyDiscount);
    notes.push(text("notes.pair_programming"));
  }

  return { value, notes };
}

/** How many unreviewed AI commits one review cleans up, chain bonus included. */
export function reviewCleanCount(state: RunState, effects = gatherEffects(state)): number {
  const { review } = BALANCE;
  const chain = state.player.aiChain >= review.chainLength;
  return review.cleans + effects.reviewExtraCommits + (chain ? review.chainBonus : 0);
}

/** Turns between two automatic reviews, or 0 when the player has no review bot. */
export function freeReviewCadence(effects: Effects): number {
  if (effects.freeReviewEvery <= 0) return 0;
  return Math.max(1, BALANCE.review.botCadence - (effects.freeReviewEvery - 1));
}

export interface DebtView {
  exact: number | null;
  range: [number, number];
}

/**
 * What the player is allowed to know about the debt.
 *
 * The original design hid the gauge entirely. That punishes without teaching,
 * so instead it is shown as a band whose width the build controls: wide by
 * default, wider for the Vibe Coder, and exact once a linter is watching.
 */
export function debtView(state: RunState, effects = gatherEffects(state)): DebtView {
  const { debt } = BALANCE;
  if (effects.debtVisible) {
    return { exact: state.debt, range: [state.debt, state.debt] };
  }

  const spread = debt.fuzzSpread + effects.debtFuzzBonus;
  const centre = state.debt + state.debtNoise;
  const step = debt.fuzzStep;

  const min = Math.max(0, Math.floor((centre - spread) / step) * step);
  const max = Math.min(debt.max, Math.ceil((centre + spread) / step) * step);

  return { exact: null, range: [min, Math.max(min, max)] };
}

function clampChance(value: number): number {
  const { min, max } = BALANCE.commit.clamp;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
