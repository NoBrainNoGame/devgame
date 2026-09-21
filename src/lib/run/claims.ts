import "@/lib/server-only";

import type { MetaProgressDto, RunSaveDto } from "@/game";

/**
 * Checking the conditions a run claims it was played under.
 *
 * The replay is only as trustworthy as what it starts from, and a save states
 * its own starting conditions: which starter was used, which skills the account
 * had unlocked, how many stat points it had spent. Those are not decorative —
 * `unlockedSkills` decides which skills the generated map offers, and
 * `statPoints` feeds straight into every success chance and the energy ceiling.
 *
 * Left unchecked, a client can hand the server a save claiming 999 in every
 * stat, and the replay will faithfully confirm a score that player could never
 * have reached. That is the whole anti-cheat defeated by a field nobody looked
 * at.
 *
 * The rule is one-sided on purpose: a save may claim **less** than the account
 * has, because a run recorded last week legitimately predates this week's
 * unlocks. It may never claim more.
 */
export function overclaims(save: RunSaveDto, meta: MetaProgressDto): string | null {
  if (!meta.unlockedProfiles.includes(save.profileId)) {
    return `This account has not unlocked the ${save.profileId} starter`;
  }

  const unlocked = new Set(meta.unlockedSkills);
  const extra = save.unlockedSkills.filter((id) => !unlocked.has(id));
  if (extra.length > 0) {
    return `This account has not unlocked ${extra.sort().join(", ")}`;
  }

  for (const [key, claimed] of Object.entries(save.statPoints)) {
    const held = meta.statPoints[key as keyof MetaProgressDto["statPoints"]];
    if (claimed > held) {
      return `This account has ${held} points in ${key}, not ${claimed}`;
    }
  }

  return null;
}
