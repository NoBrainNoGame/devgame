import type { SfxId } from "@/game/audio/sfx";

/**
 * Where the sounds would come from. Every file is `null` today: the
 * skeleton is wired, the sounds are not. Filling one in is adding a path
 * here and nothing else.
 *
 * The ambience is a calm base loop, one loop more per ticket held beside
 * the first, and an unsettling layer the tension fades in — the tension
 * being the tier and production's patience, so the drone thickens as the
 * run climbs and as the run strains.
 */
export const SFX_FILES: Record<SfxId, string | null> = {
  commit_craft: null,
  commit_ai: null,
  roll_fail: null,
  review: null,
  merge: null,
  release: null,
  relic: null,
  payday: null,
  incident: null,
  conflict: null,
  explosion: null,
  hire: null,
  leave: null,
  outage: null,
  event_open: null,
  event_answer: null,
  objective: null,
  tier_up: null,
  deadline: null,
  crunch: null,
  game_over: null,
};

export const AMBIENT_FILES = {
  base: null as string | null,
  /** One per extra ticket in hand, in this order. */
  layers: [null, null, null] as (string | null)[],
  dread: null as string | null,
};

/** How the tension is read: six tenths the tier, four tenths the patience. */
export const TENSION = { tierWeight: 0.6, qualityWeight: 0.4 } as const;
