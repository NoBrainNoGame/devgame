import { emptyMeta, type MetaProgressDto, MetaProgressSchema } from "@/game";

/**
 * Mapping between a `Profile` row and the shared meta DTO.
 *
 * The row keeps as columns the fields worth indexing or incrementing, and the
 * rest as JSON. Anything JSON-shaped is re-validated on the way out: a column
 * written by an older build is untrusted input like any other, and a shape the
 * current schema rejects should read as a fresh account rather than crash a
 * page.
 *
 * It lives outside `actions.ts` because a `"use server"` module may only export
 * async functions, and these are neither async nor actions.
 */

export interface ProfileRow {
  level: number;
  xp: number;
  commitsBank: number;
  totalCommits: number;
  ticketsDelivered: number;
  unlocks: unknown;
  settings: unknown;
  metaVersion: number;
  updatedAt: Date;
}

export function toMeta(row: ProfileRow): MetaProgressDto {
  const fallback = emptyMeta(row.updatedAt.toISOString());

  const candidate = {
    ...fallback,
    level: row.level,
    xp: row.xp,
    commitsBank: row.commitsBank,
    totalCommits: row.totalCommits,
    ticketsDelivered: row.ticketsDelivered,
    metaVersion: row.metaVersion,
    updatedAt: row.updatedAt.toISOString(),
    ...(isRecord(row.settings) ? row.settings : {}),
    ...(isRecord(row.unlocks) ? row.unlocks : {}),
  };

  const parsed = MetaProgressSchema.safeParse(candidate);
  return parsed.success ? parsed.data : fallback;
}

export function toColumns(meta: MetaProgressDto) {
  return {
    level: meta.level,
    xp: meta.xp,
    commitsBank: meta.commitsBank,
    totalCommits: meta.totalCommits,
    ticketsDelivered: meta.ticketsDelivered,
    unlocks: {
      unlockedProfiles: meta.unlockedProfiles,
      unlockedSkills: meta.unlockedSkills,
    },
    // Rows written before the skill tree still carry `statPoints` in here;
    // the schema drops them on the way out.
    settings: {
      settings: meta.settings,
      version: meta.version,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
