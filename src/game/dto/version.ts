import {
  ACQUISITION_IDS,
  AMBIENT_EVENT_IDS,
  COMPETITOR_IDS,
  DEV_RANKS,
  FAILURE_EVENT_IDS,
  MERGE_EVENT_IDS,
  NARRATIVE_EVENT_IDS,
  OBJECTIVE_IDS,
  PROFILE_IDS,
  RELIC_IDS,
  SKILL_IDS,
  TICKET_KINDS,
  TREE_IDS,
  UPGRADE_IDS,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { canonicalJson, fnv1aHex } from "@/game/core/hash";

/**
 * Two different numbers, because two different things can change.
 *
 * `SAVE_VERSION` is the shape of a saved run — what a `PlayerAction` looks
 * like. It is bumped by hand, and every bump gets a migration, because an old
 * save must keep loading.
 *
 * `RULES_FINGERPRINT` is what the rules *do*. A save carrying an old one still
 * loads and still shows its score, but it is not comparable with today's runs,
 * so the leaderboard turns it away.
 *
 * It moves on its own when the balance table or the content ids change. It
 * cannot detect a change to the rules *code* — fixing a bug in how a branch
 * merges alters every replay without touching a single number — so
 * `RULES_EPOCH` is the half you bump by hand. If a change makes an old action
 * log reach a different game, it belongs to a new epoch. When in doubt, bump
 * it: the cost is a board that starts again, and the cost of not bumping it is
 * a board comparing two different games.
 *
 * `tests/content.test.ts` pins the result, so neither half can move unnoticed.
 */
export const SAVE_VERSION = 3;

/**
 * The rules generation. Bumped by hand when a change makes an old action log
 * replay to a *different game*, which the fingerprint cannot see on its own.
 *
 * Still 1: the game has never been published, so no board has ever compared
 * two runs. The epochs this went through while the rules were being built
 * protected nothing and are not worth carrying — the first number that will
 * ever mean anything is the one in force when scores start being submitted.
 * Everything before that is a game nobody played.
 *
 * For the record, what would have been epoch 2 had anyone been playing: a
 * ticket's column taken at its first commit rather than at its opening, a
 * refused review pulling the next backlog ticket rather than inventing one,
 * skill tickets expiring with their sprint, and the skill-ticket chance moved
 * by a tree node. And what would have been epoch 3: tiers, a load in users
 * and a tier reached by lifetime earnings, a shop that is a ladder, and a
 * team whose speed is its rank. And epoch 4: the sprint's relics replaced by
 * sprint bonuses — boosts spent on the spot, a few keeps — with an offer
 * drawn from what the run can use. And epoch 5: obstacles — a commit on a
 * feature may turn a sub-ticket up, drawn from the PRNG, that forks off the
 * feature and holds its review — a repository that starts with a commit on
 * `main`, so every node id moved, and a hire that draws a name.
 */
export const RULES_EPOCH = 1;

export interface RulesEpoch {
  epoch: number;
  /** `package.json`'s version when this epoch reached `main`. */
  version: string;
  /** The day it reached `main`, as `YYYY-MM-DD`. */
  releasedAt: string;
}

/**
 * Every epoch the boards can show, oldest first; the last row is the one in
 * force. The board filters on one epoch at a time, the current one by
 * default, and offers the others by this list, labelled with the version
 * that shipped them. Bumping `RULES_EPOCH` means adding a row here: the
 * epoch, the package version being released, and the day it lands on
 * `main`. `tests/content.test.ts` checks the last row is `RULES_EPOCH` and
 * that its version is `package.json`'s.
 */
export const RULES_EPOCHS: readonly RulesEpoch[] = [
  { epoch: 1, version: "0.1.0", releasedAt: "2026-09-22" },
];

export function rulesEpochOf(epoch: number): RulesEpoch | undefined {
  return RULES_EPOCHS.find((row) => row.epoch === epoch);
}

/**
 * Exported so a test can compute the fingerprint for a *different* epoch and
 * prove the epoch actually feeds it. Comparing the real hash against an
 * ad-hoc object would pass whether or not the epoch were included, because the
 * two shapes differ anyway — which is a test that guards nothing.
 */
export function fingerprintFor(epoch: number): string {
  return fnv1aHex(
    canonicalJson({
      epoch,
      balance: BALANCE,
      skills: SKILL_IDS,
      relics: RELIC_IDS,
      tree: TREE_IDS,
      upgrades: UPGRADE_IDS,
      ranks: DEV_RANKS,
      acquisitions: ACQUISITION_IDS,
      competitors: COMPETITOR_IDS,
      ticketKinds: TICKET_KINDS,
      narrative: NARRATIVE_EVENT_IDS,
      objectives: OBJECTIVE_IDS,
      profiles: PROFILE_IDS,
      failures: FAILURE_EVENT_IDS,
      merges: MERGE_EVENT_IDS,
      ambient: AMBIENT_EVENT_IDS,
    }),
  );
}

export const RULES_FINGERPRINT = fingerprintFor(RULES_EPOCH);
