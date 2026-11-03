import type { RunSnapshot } from "@/game";
import { BALANCE } from "@/game/core/balance";

/**
 * The tutorial, one lesson per feature, each taught when the feature first
 * matters to the player rather than all at once on arrival: a player shown
 * twenty screens before the first commit skips all twenty.
 *
 * A lesson is one to three steps, an i18n key each (`tutorial.lessons.<id>.s<n>`),
 * a HUD element to light up (`data-tutorial="<anchor>"`), and the moment it
 * applies. The order of `LESSONS` is the priority when several apply at once.
 * Pure: `tests/tutorial.test.ts` runs it on plain snapshots.
 */

export type TutorialWhere = "stage" | "lobby";

/** What the moment is made of: the run, and in a company the round around it. */
export interface TutorialContext {
  where: TutorialWhere;
  multi: boolean;
  snapshot: RunSnapshot | null;
  /** In a company: whether this round's move is chosen, and the rounds missed in a row. */
  round: { mine: boolean; misses: number } | null;
  /** Something new to spend on in the Upgrades window. */
  upgradesNews: boolean;
}

export interface Lesson {
  id: string;
  /** Solo, company, or both. */
  modes: readonly ("solo" | "multi")[];
  where: TutorialWhere;
  steps: number;
  /** The `data-tutorial` value of the element it is about. */
  anchor?: string;
  /**
   * Taught as soon as it applies. The others wait `TURNS_BETWEEN_LESSONS`
   * after the last one, so the run is played between two of them.
   */
  essential?: boolean;
  /** When it applies, on the stage; absent, as soon as its screen is open. */
  applies?: (snapshot: RunSnapshot, context: TutorialContext) => boolean;
}

export const TURNS_BETWEEN_LESSONS = 2;

/** Code health worth a word: half way to the forced refactor. */
const DEBT_WORTH_A_LESSON = BALANCE.debt.explosionThreshold / 2;
/** Turns into the run before the Auto switch is worth showing. */
const IDLE_AFTER_TURNS = 12;
/** Turns left in the sprint when its end is worth announcing. */
const SPRINT_END_SOON = 3;
/** Earlier in a company: its vote must be explained before it opens. */
const VOTE_SOON = 5;

const can = (snapshot: RunSnapshot, type: RunSnapshot["actions"][number]["type"]): boolean =>
  snapshot.actions.some((action) => action.type === type);

const openOfKind = (snapshot: RunSnapshot, kind: string): boolean =>
  snapshot.tickets.some((ticket) => ticket.kind === kind && ticket.status === "open");

const turnsLeft = (snapshot: RunSnapshot): number => snapshot.sprintTurns - snapshot.sprintTurn;

const BOTH = ["solo", "multi"] as const;

export const LESSONS: readonly Lesson[] = [
  {
    id: "lobby",
    modes: ["multi"],
    where: "lobby",
    steps: 2,
    anchor: "lobby-create",
    essential: true,
  },
  {
    id: "welcome",
    modes: ["solo"],
    where: "stage",
    steps: 2,
    anchor: "graph",
    essential: true,
  },
  {
    id: "company",
    modes: ["multi"],
    where: "stage",
    steps: 2,
    anchor: "graph",
    essential: true,
    applies: (snapshot) => snapshot.crew !== undefined,
  },
  {
    id: "round",
    modes: ["multi"],
    where: "stage",
    steps: 2,
    anchor: "round",
    essential: true,
    applies: (_, context) => context.round !== null,
  },
  {
    id: "board",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "board",
    essential: true,
    applies: (snapshot) => snapshot.player.ticketId === null && can(snapshot, "start"),
  },
  {
    id: "commit",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "actions",
    essential: true,
    applies: (snapshot) => snapshot.player.ticketId !== null && can(snapshot, "commit"),
  },
  {
    id: "pending",
    modes: ["multi"],
    where: "stage",
    steps: 1,
    anchor: "pending",
    essential: true,
    applies: (_, context) => context.round?.mine === true,
  },
  {
    id: "review",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "actions",
    applies: (snapshot) => snapshot.player.unreviewed > 0 && can(snapshot, "review"),
  },
  {
    id: "pr",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "actions",
    applies: (snapshot) => can(snapshot, "submit"),
  },
  {
    id: "energy",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "energy",
    applies: (snapshot) => snapshot.player.energy * 2 <= snapshot.player.energyMax,
  },
  {
    id: "missed",
    modes: ["multi"],
    where: "stage",
    steps: 1,
    anchor: "round",
    // Not paced: a third miss hands the seat to the supervisor.
    essential: true,
    applies: (_, context) => (context.round?.misses ?? 0) > 0,
  },
  {
    id: "hotfix",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "tickets",
    applies: (snapshot) => openOfKind(snapshot, "hotfix"),
  },
  {
    id: "obstacle",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "tickets",
    applies: (snapshot) => openOfKind(snapshot, "obstacle"),
  },
  {
    id: "patience",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "patience",
    applies: (snapshot) => snapshot.quality > 0,
  },
  {
    id: "revenue",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "money",
    applies: (snapshot) => snapshot.ticketsDelivered > 0,
  },
  {
    id: "debt",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "health",
    applies: (snapshot) => (snapshot.debt.exact ?? snapshot.debt.range[0]) >= DEBT_WORTH_A_LESSON,
  },
  {
    id: "vote",
    modes: ["multi"],
    where: "stage",
    steps: 1,
    anchor: "sprint",
    applies: (snapshot) => turnsLeft(snapshot) <= VOTE_SOON,
  },
  {
    id: "sprint",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "sprint",
    applies: (snapshot) => turnsLeft(snapshot) <= SPRINT_END_SOON,
  },
  {
    id: "upgrades",
    modes: BOTH,
    where: "stage",
    steps: 2,
    anchor: "upgrades",
    applies: (snapshot, context) =>
      snapshot.sprint >= 2 && (snapshot.skillPoints > 0 || context.upgradesNews),
  },
  {
    id: "capacity",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "money",
    applies: (snapshot) => snapshot.economy.alert !== "ok",
  },
  {
    id: "team",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "tickets",
    applies: (snapshot) => snapshot.devs.length > 0,
  },
  {
    id: "teammates",
    modes: ["multi"],
    where: "stage",
    steps: 1,
    anchor: "teammates",
    applies: (snapshot) => (snapshot.crew?.seats.length ?? 0) >= 2,
  },
  {
    id: "sites",
    modes: ["multi"],
    where: "stage",
    steps: 1,
    anchor: "teammates",
    applies: (snapshot) => (snapshot.crew?.sites.length ?? 0) >= 2,
  },
  {
    id: "companyDialog",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "company",
    applies: (snapshot) => snapshot.economy.tier >= 1,
  },
  {
    id: "hack",
    modes: BOTH,
    where: "stage",
    steps: 1,
    anchor: "actions",
    applies: (snapshot) => snapshot.hack !== null,
  },
  {
    id: "idle",
    modes: ["solo"],
    where: "stage",
    steps: 1,
    anchor: "idle",
    applies: (snapshot) => snapshot.turn >= IDLE_AFTER_TURNS,
  },
];

export const LESSON_IDS: readonly string[] = LESSONS.map((lesson) => lesson.id);

/**
 * The lesson to teach now, if any: the first that applies, is not done, and
 * is allowed by the pacing. `lastTurn` is the turn the previous lesson closed
 * on in this session, null before any.
 */
export function nextLesson(
  context: TutorialContext,
  done: ReadonlySet<string>,
  lastTurn: number | null,
): Lesson | null {
  const mode = context.multi ? "multi" : "solo";
  const turn = context.snapshot?.turn ?? 0;
  const rested = lastTurn === null || turn - lastTurn >= TURNS_BETWEEN_LESSONS;

  for (const lesson of LESSONS) {
    if (lesson.where !== context.where || !lesson.modes.includes(mode)) continue;
    if (done.has(lesson.id)) continue;
    if (lesson.where === "stage") {
      // Only between moves: a question on screen is no time for a lesson.
      const snapshot = context.snapshot;
      if (snapshot === null || snapshot.phase.kind !== "choose_action") continue;
      if (lesson.applies !== undefined && !lesson.applies(snapshot, context)) continue;
    }
    if (lesson.essential === true || rested) return lesson;
  }
  return null;
}
