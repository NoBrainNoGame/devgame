import {
  AMBIENT_EVENT_IDS,
  BOT_ARCHETYPE_IDS,
  DEVOPS_IDS,
  FAILURE_EVENT_IDS,
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
export const SAVE_VERSION = 1;

/**
 * 1 — first playable rules.
 * 2 — a branch merges on its last node (a sub-branch used to strand its
 *     parent), a review charges energy, monitoring warns before a production
 *     bug, and a detour may no longer hop over the sprint merge.
 * 3 — review has to be learned. It is offered only once a branch has granted
 *     `canReview`, and only while there is unread machine-written work for it
 *     to find. A log from epoch 2 that reviewed on turn one no longer replays.
 * 4 — the race is run in one unit. `player.sprintProgress` is an index into the
 *     main line, as a rival's always was, instead of a count of every node
 *     resolved; branch and detour work no longer advances it. Three detour
 *     kinds added — squash, docs, rebase — which changes every map.
 */
export const RULES_EPOCH = 4;

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
      bots: BOT_ARCHETYPE_IDS,
      failures: FAILURE_EVENT_IDS,
      ambient: AMBIENT_EVENT_IDS,
    }),
  );
}

export const RULES_FINGERPRINT = fingerprintFor(RULES_EPOCH);
