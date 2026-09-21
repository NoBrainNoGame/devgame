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
 * `RULES_FINGERPRINT` is what the rules *do*. It moves on its own whenever the
 * balance table or the content ids change, because such a change cannot be
 * migrated: the same actions simply produce a different game. A save carrying
 * an old fingerprint still loads and still shows its score, but it is not
 * comparable with today's runs, so the leaderboard turns it away.
 */
export const SAVE_VERSION = 1;

export const RULES_FINGERPRINT = fnv1aHex(
  canonicalJson({
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
