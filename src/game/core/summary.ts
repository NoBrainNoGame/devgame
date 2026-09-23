import {
  DEV_RANKS,
  type DevRank,
  TICKET_KINDS,
  type TicketKind,
  UPGRADE_IDS,
} from "@/game/content";
import { computeScore } from "@/game/core/score";
import type { GameOverReason, QualitySource, RunState } from "@/game/core/types";
import { RULES_EPOCH, RULES_FINGERPRINT } from "@/game/dto/version";

/**
 * A run, flattened for the people who balance the game. Everything here is
 * read off the state a replay produced — never off anything the client
 * said — and nothing in it is about the player: a seed, a starter profile,
 * and what the rules did with the decisions taken. The admin panel
 * aggregates these; `docs/maintenance.md` says how to read them.
 */
export interface RunSummary {
  rules: string;
  epoch: number;
  seed: string;
  mode: RunState["mode"];
  profileId: RunState["profileId"];
  /** How it ended, or "running" for a checkpoint of a run still going. */
  outcome: GameOverReason | "running";
  cause: QualitySource | null;
  turns: number;
  sprints: number;
  tier: number;
  score: number;
  money: { earned: number; peak: number; final: number; lost: number; mrr: number };
  share: number;
  quality: number;
  debt: number;
  ticketsDelivered: number;
  pointsDelivered: number;
  commitsTried: Record<"craft" | "ai", number>;
  commitsLanded: Record<"craft" | "ai", number>;
  reviews: number;
  rests: number;
  hacks: { tried: number; won: number };
  incidents: number;
  outages: number;
  rejections: number;
  staleForced: number;
  idleSprints: number;
  devsLeft: number;
  deadlinesMissed: number;
  qualityBySource: Record<QualitySource, number>;
  answers: Record<string, number>;
  objectives: Record<string, { done: number; failed: number }>;
  arrivedByKind: Record<TicketKind, number>;
  deliveredByPlayer: Record<TicketKind, number>;
  deliveredByTeam: number;
  tierSprint: Record<string, number>;
  hires: number;
  devsByRank: Record<DevRank, number>;
  /** Levels bought, for the upgrades with any. */
  upgrades: Record<string, number>;
  tree: Record<string, number>;
  relics: string[];
  skills: string[];
  acquisitions: string[];
  unlockedSkills: number;
  startingSkillPoints: number;
}

export function summariseRun(state: RunState): RunSummary {
  const upgrades: Record<string, number> = {};
  for (const id of UPGRADE_IDS) {
    const level = state.upgrades[id] ?? 0;
    if (level > 0) upgrades[id] = level;
  }
  const tree: Record<string, number> = {};
  for (const [id, level] of Object.entries(state.tree)) if (level > 0) tree[id] = level;
  const devsByRank = Object.fromEntries(DEV_RANKS.map((rank) => [rank, 0])) as Record<
    DevRank,
    number
  >;
  for (const dev of state.devs) devsByRank[dev.rank] += 1;
  const over = state.phase.kind === "game_over" ? state.phase : null;
  const merged = Object.values(state.tickets).filter((t) => t.status === "merged");
  const mrr = merged.reduce((sum, t) => sum + t.mrr, 0);

  return {
    rules: RULES_FINGERPRINT,
    epoch: RULES_EPOCH,
    seed: state.seed,
    mode: state.mode,
    profileId: state.profileId,
    outcome: over === null ? "running" : over.reason,
    cause: over?.cause ?? null,
    turns: state.turn,
    sprints: Math.max(0, state.sprint - 1),
    tier: state.tier,
    score: computeScore(state),
    money: {
      earned: state.moneyEarned,
      peak: state.stats.moneyPeak,
      final: state.money,
      lost: state.stats.moneyLost,
      mrr,
    },
    share: state.market.shareBonus,
    quality: state.quality,
    debt: state.debt,
    ticketsDelivered: state.ticketsDelivered,
    pointsDelivered: state.pointsDelivered,
    commitsTried: { ...state.stats.commitsTried },
    commitsLanded: { ...state.stats.commitsLanded },
    reviews: state.stats.reviews,
    rests: state.stats.rests,
    hacks: { ...state.stats.hacks },
    incidents: state.stats.incidents,
    outages: state.stats.outages,
    rejections: state.stats.rejections,
    staleForced: state.stats.staleForced,
    idleSprints: state.stats.idleSprints,
    devsLeft: state.stats.devsLeft,
    deadlinesMissed: state.stats.deadlinesMissed,
    qualityBySource: { ...state.stats.qualityBySource },
    answers: { ...state.stats.answers },
    objectives: structuredClone(state.stats.objectives),
    arrivedByKind: { ...state.stats.arrivedByKind },
    deliveredByPlayer: { ...state.stats.deliveredByPlayer },
    deliveredByTeam: state.stats.deliveredByTeam,
    tierSprint: { ...state.stats.tierSprint },
    hires: state.stats.hires,
    devsByRank,
    upgrades,
    tree,
    relics: [...state.relics],
    skills: [...state.skills],
    acquisitions: [...state.acquisitions],
    unlockedSkills: state.unlockedSkills.length,
    startingSkillPoints: state.startingSkillPoints,
  };
}

/** The kinds, for a table that wants every column even when a count is zero. */
export const SUMMARY_TICKET_KINDS = TICKET_KINDS;
