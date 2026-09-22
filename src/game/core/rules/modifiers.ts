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
import { unreadAiOn } from "@/game/core/rules/criteria";
import { behindOf, openTickets } from "@/game/core/rules/tickets";
import type { CommitMode, NodeKind, RunState, Ticket } from "@/game/core/types";

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

/**
 * Open tickets beyond the first. Each one is something else you are holding
 * in your head, and every commit and every roll pays for it.
 */
export function wipExtra(state: RunState): number {
  return Math.max(0, openTickets(state).length - 1);
}

/**
 * Share of machine-written commits a human has read, over everything still
 * on the board or shipped since the last release. With nothing unread, the
 * ratio is a perfect 1.
 */
export function reviewedRatio(state: RunState): number {
  let total = 0;
  let reviewed = 0;

  const consider = (id: string): void => {
    const commit = state.nodes[id]?.commit;
    if (commit === undefined || commit.mode !== "ai") return;
    total += 1;
    if (commit.reviewed) reviewed += 1;
  };

  for (const id of state.shipped) consider(id);
  for (const ticket of openTickets(state)) {
    for (const id of ticket.nodeIds) consider(id);
  }

  return total === 0 ? 1 : reviewed / total;
}

/**
 * The odds that landing a ticket tangles.
 *
 * A conflict is not something that happens while you write a commit — it is
 * what happens when two histories meet. So it is priced by what you are
 * bringing to the merge: how much debt, how much machine-written work nobody
 * has read, and how far `dev` has moved since you left it.
 */
export function mergeConflictChance(state: RunState, ticket: Ticket): number {
  const { failure } = BALANCE;

  const value =
    failure.mergeConflictBase +
    Math.floor(state.debt / failure.mergeConflictDebtDivisor) +
    unreadAiOn(state, ticket).length * failure.mergeConflictPerUnread +
    behindOf(state, ticket) * failure.mergeConflictPerBehind;

  return Math.max(0, Math.min(failure.mergeConflictMax, value));
}

/**
 * Success chance for writing a commit of `kind` with a given hand, in percent,
 * already clamped. `risky` replaces the base chance rather than adding to it:
 * it is a different kind of gamble, not a worse commit.
 */
export function commitChance(
  state: RunState,
  mode: CommitMode,
  kind: NodeKind,
  effects = gatherEffects(state),
): Breakdown {
  const notes: I18nText[] = [];
  const { commit } = BALANCE;

  let value: number =
    kind === "risky" ? commit.riskyBase : kind === "rebase" ? commit.rebaseBase : commit.base[mode];

  const perMode =
    kind === "risky"
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

  // A rebase replays your commits on top of `dev`, so it is priced by how
  // clean they are rather than by luck: same malus, far steeper divisor.
  const divisor = kind === "rebase" ? commit.rebaseDebtDivisor : commit.debtRiskDivisor;
  const debtMalus = Math.floor(state.debt / divisor);
  if (debtMalus > 0) {
    value -= debtMalus;
    notes.push(text("notes.debt", { points: signed(-debtMalus) }));
  }

  if (isCrunch(state)) {
    value -= BALANCE.energy.crunchMalusPoints;
    notes.push(text("notes.crunch", { points: signed(-BALANCE.energy.crunchMalusPoints) }));
  }

  const extra = wipExtra(state);
  if (extra > 0) {
    const malus = BALANCE.wip.malusPerExtra * extra;
    value -= malus;
    notes.push(text("notes.wip", { points: signed(-malus), count: extra }));
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
 * Energy to write a commit of `kind`. `mode` is absent for nodes that are
 * landed rather than written — a merge.
 *
 * The machine's price is flat: one point, whatever the commit. It does not
 * get cheaper for being a refactor and it does not get dearer for being a
 * risky one — that indifference is the thing it sells.
 */
export function nodeEnergyCost(
  state: RunState,
  kind: NodeKind,
  mode: CommitMode | undefined,
): Breakdown {
  const notes: I18nText[] = [];
  let value: number;

  if (mode === "ai") {
    value = BALANCE.energy.commitCost.ai;
    notes.push(text("notes.machine_flat"));
  } else {
    value = BALANCE.energy.cost[kind];
    if (mode !== undefined) value += BALANCE.energy.commitCost[mode];
  }

  if (kind === "refactor" && mode !== undefined && state.player.freeRefactor) {
    notes.push(text("notes.free_refactor"));
    return { value: 0, notes };
  }

  const extra = wipExtra(state);
  if (extra > 0 && value > 0) {
    const multiplier = 1 + BALANCE.wip.energyPerExtra * extra;
    value = Math.round(value * multiplier);
    notes.push(text("notes.wip_cost", { count: extra }));
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
