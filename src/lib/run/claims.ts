import "@/lib/server-only";

import { accountSkillPoints, type MetaProgressDto, type RunSaveDto } from "@/game";

/**
 * Checking the conditions a run claims it was played under.
 *
 * The replay is only as trustworthy as what it starts from, and a save states
 * its own starting conditions: which starter was used, which skills the account
 * had unlocked, how many skill points its level granted. Those are not
 * decorative — `unlockedSkills` decides which skills the board offers, and
 * the starting points buy tree levels that feed every success chance and the
 * energy ceiling.
 *
 * Left unchecked, a client can hand the server a save claiming 999 starting
 * points, and the replay will faithfully confirm a score that player could
 * never have reached. That is the whole anti-cheat defeated by a field nobody
 * looked at.
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

  // `meta.level` rather than a level derived from XP: it is the number the
  // profile page shows, and the session credits the same one.
  const held = accountSkillPoints(meta.level);
  if (save.startingSkillPoints > held) {
    return `This account starts with ${held} skill points, not ${save.startingSkillPoints}`;
  }

  return null;
}
