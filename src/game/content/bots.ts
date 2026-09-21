import type { BotSkillId } from "@/game/content/skills";

/**
 * Rival bots share `main` with the player. Each has a pace, a rate of
 * self-inflicted mistakes, a temper that bends the failure table, and a trophy
 * skill you take when it gets fired.
 *
 * The order here is the order they arrive: the first sprint faces the Rapide
 * alone, and every sprint after that adds the next one, up to four.
 */

export const BOT_ARCHETYPE_IDS = ["rapide", "reviewer", "force_pusher", "tortue"] as const;

export type BotArchetypeId = (typeof BOT_ARCHETYPE_IDS)[number];

export interface BotArchetypeDef {
  id: BotArchetypeId;
  /** Progress accumulated per turn, in percent of one node. */
  speedPct: number;
  /** Chance per turn of a visible mistake that stalls it for a turn. */
  mistakePct: number;
  /** Debt it hands you when you inherit its branches. */
  inheritedDebt: number;
  /** Turns of sustained lead needed to get it fired. The Tortue is stubborn. */
  firingTurns: number;
  /** Added to the weight of the failure it specialises in, while it is alive. */
  pressure: { prRejected?: number; forcedRebase?: number; debtPerMistake?: number };
  trophy: BotSkillId;
}

export const BOT_ARCHETYPES: Record<BotArchetypeId, BotArchetypeDef> = {
  rapide: {
    id: "rapide",
    speedPct: 90,
    mistakePct: 20,
    inheritedDebt: 15,
    firingTurns: 6,
    // It ships fast and breaks things — on a shared `main`, that is your debt.
    pressure: { debtPerMistake: 3 },
    trophy: "sprint_final",
  },
  reviewer: {
    id: "reviewer",
    speedPct: 60,
    mistakePct: 10,
    inheritedDebt: 5,
    firingTurns: 6,
    pressure: { prRejected: 15 },
    trophy: "lynx_eye",
  },
  force_pusher: {
    id: "force_pusher",
    speedPct: 70,
    mistakePct: 12,
    inheritedDebt: 10,
    firingTurns: 6,
    pressure: { forcedRebase: 15 },
    trophy: "rebase_master",
  },
  tortue: {
    id: "tortue",
    speedPct: 45,
    mistakePct: 3,
    inheritedDebt: 0,
    firingTurns: 9,
    pressure: {},
    trophy: "zen",
  },
};
