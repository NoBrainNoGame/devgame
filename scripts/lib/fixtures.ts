import { createHash } from "node:crypto";

import type { ProfileId } from "@/game/content";
import { fnv1a } from "@/game/core/hash";
import { createRng } from "@/game/core/rng";
import { getAvailableActions } from "@/game/core/rules/actions";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import { accountSkillPoints } from "@/game/core/score";
import type { PlayerAction, RunMode, RunState } from "@/game/core/types";
import type { MetaProgressDto } from "@/game/dto/meta";
import type { RunSaveDto } from "@/game/dto/run";
import { RULES_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";
import { CHECKPOINT_EVERY_SPRINTS } from "@/lib/telemetry/schema";
import { KNOWN_PATHS, type KnownPath, utcDay } from "@/lib/visits/paths";

import { choose, chooseQuit, type PolicyName } from "./policy";

/**
 * What `bun run fixtures` puts in a development database, and how it plays
 * the runs it puts there. Pure: no database, no clock. The loader in
 * `scripts/fixtures.ts` supplies both.
 *
 * The one rule that shapes this file: a fixture run is a *real* run. The
 * board trusts a score only after `replayRun`, so a fixture cannot invent
 * one — it plays the engine with a headless policy and stores the log, and
 * the loader replays that log exactly as `submitRun` would.
 */

/** Every fixture account has an address here, which is how a re-run finds them. */
export const FIXTURE_EMAIL_DOMAIN = "fixtures.devgame.local";

/**
 * Every fixture run's `clientRunId` starts with this, which is how a re-run
 * finds the run samples — they carry no user id, on purpose.
 */
export const FIXTURE_RUN_PREFIX = "f1c70000-";

export type FixtureLocale = "fr" | "en";

export interface FixtureAccount {
  /** The user id is `fx_<slug>`, the address `<slug>@fixtures.devgame.local`. */
  slug: string;
  /** At most 24 characters: the column's width. */
  displayName: string;
  policy: PolicyName;
  locale: FixtureLocale;
  /**
   * Finished classic runs, oldest first: days before the load, and the
   * sprint the player held on until (see `quitAtSprint`). Zero: the policy
   * plays until the rules end the run, which only the blind machine reaches.
   */
  classic: readonly (readonly [daysAgo: number, held: number])[];
  /** Dailies played, on the server's seed for that day, with the sprint held until. */
  daily: readonly (readonly [which: "today" | "yesterday", held: number])[];
  /** A run still going in that mode — the cloud save the play page resumes. */
  inProgress?: RunMode;
  /** A classic run left behind for another one. */
  abandoned?: boolean;
  /** A tampered log the server refused. */
  rejected?: boolean;
  /** Suspended, with this reason: plays on, off the board. */
  banned?: string;
  /** How long ago the account was created, in days. */
  since: number;
}

/**
 * Twelve players and one bot. The policies and the sprints held are spread
 * so the board has a range: the careful hands last and score, the blind
 * machine dies early, and the accounts with many runs level up and unlock
 * starters.
 */
export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  {
    slug: "ada",
    displayName: "ada",
    policy: "careful",
    locale: "en",
    classic: [
      [27, 4],
      [19, 7],
      [11, 10],
      [4, 14],
      [1, 18],
    ],
    daily: [
      ["today", 12],
      ["yesterday", 10],
    ],
    since: 30,
  },
  {
    slug: "grace",
    displayName: "grace_hopper",
    policy: "mixed",
    locale: "en",
    classic: [
      [25, 3],
      [16, 6],
      [8, 9],
      [2, 13],
    ],
    daily: [["today", 9]],
    inProgress: "classic",
    since: 28,
  },
  {
    slug: "linus",
    displayName: "linus",
    policy: "craft",
    locale: "fr",
    classic: [
      [22, 5],
      [12, 8],
      [3, 12],
    ],
    daily: [
      ["today", 11],
      ["yesterday", 8],
    ],
    since: 26,
  },
  {
    slug: "margaret",
    displayName: "margaret_h",
    policy: "careful",
    locale: "fr",
    classic: [
      [20, 4],
      [5, 9],
    ],
    daily: [["yesterday", 12]],
    abandoned: true,
    since: 24,
  },
  {
    slug: "dennis",
    displayName: "dmr",
    policy: "mixed",
    locale: "en",
    classic: [
      [19, 3],
      [2, 8],
    ],
    daily: [],
    inProgress: "daily",
    since: 22,
  },
  {
    slug: "barbara",
    displayName: "barbara_liskov",
    policy: "craft",
    locale: "fr",
    classic: [
      [16, 6],
      [7, 10],
    ],
    daily: [
      ["today", 7],
      ["yesterday", 9],
    ],
    since: 18,
  },
  {
    slug: "ken",
    displayName: "ken",
    policy: "ai",
    locale: "en",
    classic: [
      [15, 0],
      [12, 0],
      [10, 0],
    ],
    daily: [],
    since: 17,
  },
  {
    slug: "bjarne",
    displayName: "bjarne",
    policy: "mixed",
    locale: "fr",
    classic: [
      [13, 5],
      [4, 9],
    ],
    daily: [["today", 6]],
    rejected: true,
    since: 15,
  },
  {
    slug: "guido",
    displayName: "guido",
    policy: "careful",
    locale: "fr",
    classic: [[9, 15]],
    daily: [["yesterday", 7]],
    since: 11,
  },
  {
    slug: "yukihiro",
    displayName: "matz",
    policy: "craft",
    locale: "en",
    classic: [
      [6, 4],
      [1, 8],
    ],
    daily: [["today", 5]],
    inProgress: "classic",
    since: 8,
  },
  {
    slug: "brendan",
    displayName: "brendan",
    policy: "ai",
    locale: "en",
    classic: [[3, 0]],
    daily: [],
    since: 5,
  },
  {
    slug: "camille",
    displayName: "camille",
    policy: "mixed",
    locale: "fr",
    classic: [],
    daily: [],
    inProgress: "classic",
    since: 1,
  },
  {
    slug: "spambot",
    displayName: "sp4mb0t_9000",
    policy: "careful",
    locale: "en",
    classic: [
      [8, 20],
      [7, 20],
    ],
    daily: [["today", 20]],
    banned: "Automated play: same log submitted under three ids in a minute.",
    since: 9,
  },
];

export type FixtureReportStatus = "open" | "acknowledged" | "closed";

export interface FixtureReport {
  slug: string;
  title: string;
  body: string;
  page?: KnownPath;
  seed?: string;
  status: FixtureReportStatus;
  note?: string;
  daysAgo: number;
}

/** A few bug reports, in every status, so the admin panel has something to triage. */
export const FIXTURE_REPORTS: readonly FixtureReport[] = [
  {
    slug: "ada",
    title: "Merge button stays greyed after an accepted review",
    body: "Sprint 6, the review said accepted, the ticket bar shows the PR as green, but the merge button stayed disabled until I pressed rest once. Happened twice on the same run.",
    page: "/play",
    seed: "fixture-ada-3",
    status: "open",
    daysAgo: 1,
  },
  {
    slug: "linus",
    title: "La barre d'énergie ne se met pas à jour après un repos",
    body: "Après « souffler » l'énergie affichée reste à 2 alors que le journal dit +6. Un rafraîchissement de la page corrige l'affichage.",
    page: "/play",
    status: "open",
    daysAgo: 2,
  },
  {
    slug: "margaret",
    title: "Leaderboard shows yesterday's daily under today",
    body: "Around midnight UTC the daily tab kept showing the previous board for a minute or two after the countdown reached zero. Refreshing fixed it.",
    page: "/leaderboard",
    status: "acknowledged",
    note: "Cache revalidation lag at the day boundary; harmless, low priority.",
    daysAgo: 5,
  },
  {
    slug: "guido",
    title: "Display name form accepts trailing spaces",
    body: "Typing a name with spaces at the end saves them, and the leaderboard then shows an odd gap after the name.",
    page: "/profile",
    status: "closed",
    note: "Fixed: the action trims before it writes.",
    daysAgo: 9,
  },
  {
    slug: "bjarne",
    title: "Mon score n'apparaît pas dans le classement",
    body: "J'ai terminé une run classique avec un bon score, l'écran de fin l'affiche, mais le classement ne me montre pas. Je suis bien connecté.",
    page: "/leaderboard",
    seed: "fixture-bjarne-tampered",
    status: "closed",
    note: "The submitted log does not replay (it continues past the end). Not a bug on our side.",
    daysAgo: 3,
  },
];

/**
 * A stable, well-formed UUID for a name, with the fixture marker in front.
 * Version and variant nibbles are set so `z.uuid()` accepts it.
 */
export function fixtureUuid(name: string): string {
  const h = createHash("sha256").update(`devgame-fixture:${name}`).digest("hex");
  return `${FIXTURE_RUN_PREFIX}${h.slice(0, 4)}-4${h.slice(4, 7)}-8${h.slice(7, 10)}-${h.slice(10, 22)}`;
}

/**
 * Whether a connection string points at this machine. The loader refuses
 * anything else: a `.env` aimed at production administers production, and
 * a fixture load there would put thirteen invented players on a real board.
 */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** Free actions in a row before the policy is declared to be looping. */
const MAX_FREE_STREAK = 200;

/** Turn-consuming actions before a run is declared unending. */
const DEFAULT_MAX_TURNS = 1500;

export interface PlayOptions {
  seed: string;
  mode: RunMode;
  profileId: ProfileId;
  policy: PolicyName;
  /** The account's progress when the run started: unlocks and starting points come from it. */
  meta: MetaProgressDto;
  clientRunId: string;
  createdAt: string;
  /** Stop as soon as this sprint begins, leaving the run in progress. */
  stopAtSprint?: number;
  /**
   * From this sprint on, the player walks away (`chooseQuit`) and the run
   * ends in burnout within a sprint or two, so where it ends decides the
   * score. Without it, the patient policies never lose.
   */
  quitAtSprint?: number;
  maxTurns?: number;
}

export interface PlayedRun {
  save: RunSaveDto;
  state: RunState;
  /**
   * Where the play page would have sent a checkpoint: the length of the log
   * at the first move of every tenth sprint.
   */
  checkpoints: number[];
}

/**
 * Plays a run headlessly and returns the save the client would have kept.
 * The save claims exactly what the account holds — its unlocked skills, the
 * points its level grants — so `overclaims` lets it through and the replay
 * starts from the same map the policy saw.
 */
export function playFixtureRun(options: PlayOptions): PlayedRun {
  const startingSkillPoints = accountSkillPoints(options.meta.level);
  let state = createRun({
    seed: options.seed,
    mode: options.mode,
    profileId: options.profileId,
    version: SAVE_VERSION,
    meta: { unlockedSkills: options.meta.unlockedSkills, startingSkillPoints },
  });

  const actions: PlayerAction[] = [];
  const checkpoints: number[] = [];
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  let freeStreak = 0;
  let lastCheckpoint = 0;

  while (state.phase.kind !== "game_over" && state.turn < maxTurns) {
    if (options.stopAtSprint !== undefined && state.sprint >= options.stopAtSprint) break;

    const legal = getAvailableActions(state);
    if (legal.length === 0) {
      throw new Error(`${options.seed}: the engine offers no action at turn ${state.turn}`);
    }
    const quit = options.quitAtSprint !== undefined && state.sprint >= options.quitAtSprint;
    const action = quit ? chooseQuit(state, legal) : choose(options.policy, state, legal);
    const turnBefore = state.turn;
    state = applyAction(state, action).state;
    actions.push(action);

    freeStreak = state.turn === turnBefore ? freeStreak + 1 : 0;
    if (freeStreak > MAX_FREE_STREAK) {
      throw new Error(`${options.seed}: the ${options.policy} policy loops at turn ${state.turn}`);
    }

    if (
      state.phase.kind !== "game_over" &&
      state.sprint % CHECKPOINT_EVERY_SPRINTS === 0 &&
      state.sprint !== lastCheckpoint
    ) {
      lastCheckpoint = state.sprint;
      checkpoints.push(actions.length);
    }
  }

  return {
    save: {
      version: SAVE_VERSION,
      rules: RULES_FINGERPRINT,
      seed: options.seed,
      mode: options.mode,
      profileId: options.profileId,
      unlockedSkills: [...options.meta.unlockedSkills],
      startingSkillPoints,
      actions,
      clientRunId: options.clientRunId,
      createdAt: options.createdAt,
    },
    state,
    checkpoints,
  };
}

/**
 * The starter an account plays with: the Junior until something else is
 * unlocked, then whatever the run count lands on, so a levelled account
 * shows every starter it has earned.
 */
export function starterFor(meta: MetaProgressDto, runIndex: number): ProfileId {
  const unlocked = [...meta.unlockedProfiles].sort();
  return unlocked[runIndex % unlocked.length] ?? "junior";
}

export interface VisitRow {
  day: Date;
  path: KnownPath;
  locale: FixtureLocale;
  views: number;
  visits: number;
}

/** How many days of page views the loader writes. */
export const VISIT_DAYS = 30;

/** Views a busy weekday brings to each page, before the day's noise. */
const PAGE_WEIGHT: Record<KnownPath, number> = {
  "/": 40,
  "/play": 55,
  "/leaderboard": 18,
  "/profile": 6,
  "/login": 5,
  "/report": 1,
  "/legal": 1,
  "/other": 2,
};

/** Share of the traffic in French, the source language. */
const FRENCH_SHARE = 0.7;

/**
 * A month of page views with a shape to it — quieter weekends, a slow rise,
 * a little noise — so the admin's Stats page looks like a site rather than
 * a flat line. Deterministic: the same days give the same rows.
 */
export function visitRows(now: Date): VisitRow[] {
  const rows: VisitRow[] = [];
  for (let back = VISIT_DAYS - 1; back >= 0; back -= 1) {
    const day = utcDay(new Date(now.getTime() - back * 86_400_000));
    const iso = day.toISOString().slice(0, 10);
    const rng = createRng({ s: fnv1a(`fixtures-visits:${iso}`) | 0 });
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const trend = 0.6 + (0.4 * (VISIT_DAYS - 1 - back)) / (VISIT_DAYS - 1);
    const dayFactor = trend * (weekend ? 0.7 : 1) * (0.85 + rng.next() * 0.3);

    for (const path of KNOWN_PATHS) {
      const total = Math.round(PAGE_WEIGHT[path] * dayFactor);
      const fr = Math.round(total * FRENCH_SHARE);
      for (const [locale, views] of [
        ["fr", fr],
        ["en", total - fr],
      ] as const) {
        // A visit is a tab's first page; the rest of its views are navigation.
        const visits = Math.round(views * (0.45 + rng.next() * 0.25));
        rows.push({ day, path, locale, views, visits });
      }
    }
  }
  return rows;
}
