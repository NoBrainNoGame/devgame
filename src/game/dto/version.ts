import {
  AMBIENT_EVENT_IDS,
  DEVOPS_IDS,
  FAILURE_EVENT_IDS,
  MERGE_EVENT_IDS,
  PROFILE_IDS,
  RELIC_IDS,
  SKILL_IDS,
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
export const SAVE_VERSION = 2;

/**
 * The rules generation. Bumped by hand when a change makes an old action log
 * replay to a *different game*, which the fingerprint cannot see on its own.
 *
 * Still 1: the game has never been published, so no board has ever compared
 * two runs. The epochs this went through while the rules were being built
 * protected nothing and are not worth carrying — the first number that will
 * ever mean anything is the one in force when scores start being submitted.
 * Everything before that is a game nobody played.
 */
export const RULES_EPOCH = 1;

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
      devops: DEVOPS_IDS,
      profiles: PROFILE_IDS,
      failures: FAILURE_EVENT_IDS,
      merges: MERGE_EVENT_IDS,
      ambient: AMBIENT_EVENT_IDS,
    }),
  );
}

export const RULES_FINGERPRINT = fingerprintFor(RULES_EPOCH);
