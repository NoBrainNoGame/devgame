/**
 * The kinds of work the board brings. A feature is the ordinary one; the
 * rest each bend one rule — a deadline, a hand the team will not take, a
 * reward that is not revenue — so that two sprints never read the same.
 * Which arrive, and how often, is `BALANCE.tickets.kinds`.
 */

export const TICKET_KINDS = [
  "feature",
  "hotfix",
  "refactor",
  "client_bug",
  "vip",
  "debt",
  "migration",
  "obstacle",
] as const;

export type TicketKind = (typeof TICKET_KINDS)[number];

export type TicketColour = "feature" | "hotfix" | "refactor" | "obstacle";

/** How many names an obstacle can have: `game.obstacles.<index>.name`. */
export const OBSTACLE_POOL_SIZE = 8;

/** The i18n key of an obstacle's name: what the commit turned up. */
export function obstacleNameKey(hash: number): string {
  return `obstacles.${Math.abs(hash) % OBSTACLE_POOL_SIZE}.name`;
}

/** Every obstacle-name key the catalogues must carry. */
export function allObstacleKeys(): string[] {
  return Array.from({ length: OBSTACLE_POOL_SIZE }, (_, i) => `obstacles.${i}.name`);
}

export interface TicketKindDef {
  id: TicketKind;
  /** The colour of its column and its card. */
  colour: TicketColour;
  /** The branch name's prefix in the gutter: `feat/t3`. */
  refPrefix: string;
  /** Whether a developer picks it up from the backlog. */
  teamTakes: boolean;
  /** Whether holding it beside another counts as work in progress. */
  countsWip: boolean;
  /** Whether it earns a revenue and brings users once shipped. */
  earnsMrr: boolean;
  /** Whether it may carry a skill. */
  grantsSkill: boolean;
  /** Only this kind of commit fills it. */
  mustWrite?: "hotfix" | "refactor";
  /** Sprints it must land in, counting the one it arrives in. */
  deadlineSprints?: number;
  /** Whether the board may force it open once it has waited too long. */
  forcedWhenStale: boolean;
  /** Whether a commit on it may turn an obstacle up. */
  spawnsObstacles: boolean;
}

export const TICKET_KIND: Record<TicketKind, TicketKindDef> = {
  feature: {
    id: "feature",
    colour: "feature",
    refPrefix: "feat",
    teamTakes: true,
    countsWip: true,
    earnsMrr: true,
    grantsSkill: true,
    forcedWhenStale: true,
    spawnsObstacles: true,
  },
  hotfix: {
    id: "hotfix",
    colour: "hotfix",
    refPrefix: "fix",
    teamTakes: false,
    countsWip: false,
    earnsMrr: false,
    grantsSkill: false,
    mustWrite: "hotfix",
    forcedWhenStale: true,
    spawnsObstacles: false,
  },
  refactor: {
    id: "refactor",
    colour: "refactor",
    refPrefix: "refacto",
    teamTakes: false,
    countsWip: true,
    earnsMrr: false,
    grantsSkill: false,
    mustWrite: "refactor",
    forcedWhenStale: true,
    spawnsObstacles: false,
  },
  /** A customer found it. Small, urgent, and production is grateful when it goes. */
  client_bug: {
    id: "client_bug",
    colour: "hotfix",
    refPrefix: "bug",
    teamTakes: true,
    countsWip: true,
    earnsMrr: false,
    grantsSkill: false,
    deadlineSprints: 1,
    forcedWhenStale: true,
    spawnsObstacles: false,
  },
  /** A big customer wants it, twice the revenue, and wants it now. */
  vip: {
    id: "vip",
    colour: "feature",
    refPrefix: "vip",
    teamTakes: false,
    countsWip: true,
    earnsMrr: true,
    grantsSkill: true,
    deadlineSprints: 1,
    // Gone with its deadline, so it is never around to be forced.
    forcedWhenStale: false,
    spawnsObstacles: true,
  },
  /** The codebase asking for a refactor of its own accord. Never forced. */
  debt: {
    id: "debt",
    colour: "refactor",
    refPrefix: "debt",
    teamTakes: false,
    countsWip: true,
    earnsMrr: false,
    grantsSkill: false,
    mustWrite: "refactor",
    forcedWhenStale: false,
    spawnsObstacles: false,
  },
  /** A library to move off. Every commit costs debt; landing it buys servers. */
  migration: {
    id: "migration",
    colour: "refactor",
    refPrefix: "migr",
    teamTakes: true,
    countsWip: true,
    earnsMrr: false,
    grantsSkill: false,
    forcedWhenStale: true,
    spawnsObstacles: true,
  },
  /**
   * What a commit turned up on the way: a bug found, a piece missing, a
   * design that will not hold. Never drawn from the backlog — it is born
   * open, in the hand of whoever was writing the feature, forked off it —
   * and it holds the feature's pull request until it has landed back on
   * it. It earns nothing, weighs nothing, and cannot spawn one of its own.
   */
  obstacle: {
    id: "obstacle",
    colour: "obstacle",
    refPrefix: "sub",
    teamTakes: false,
    countsWip: false,
    earnsMrr: false,
    grantsSkill: false,
    forcedWhenStale: false,
    spawnsObstacles: false,
  },
};

export function isTicketKind(value: string): value is TicketKind {
  return Object.hasOwn(TICKET_KIND, value);
}
