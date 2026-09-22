import { canonicalJson, fingerprint } from "@/game/core/hash";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun, hashState } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { PlayerAction, RunState } from "@/game/core/types";
import { migrate } from "@/game/dto/migrations";
import { type RunSaveDto, RunSaveSchema } from "@/game/dto/run";
import { RULES_FINGERPRINT } from "@/game/dto/version";

/**
 * Plays a submitted action log back through the rules engine.
 *
 * This is the anti-cheat. The client sends a seed and a list of decisions; the
 * server replays them and computes the score itself. A forged log either
 * reaches a different game or hits an action that was never legal, and is
 * rejected either way.
 *
 * It runs on the server, so it must stay free of anything browser-shaped —
 * which is exactly the boundary `src/game/core` already enforces.
 */

export interface ReplayStats {
  turns: number;
  sprints: number;
  ticketsDelivered: number;
  commits: number;
  /** XP the run earned. */
  xp: number;
  /** Fingerprint of the final state, for comparing a replay against a session. */
  hash: string;
}

export type ReplayResult =
  | { valid: true; finished: boolean; score: number; stats: ReplayStats; state: RunState }
  | { valid: false; error: string; failedAt?: number };

/**
 * What makes two submissions the same run.
 *
 * The idempotency key is chosen by the client, so it cannot be the only thing
 * standing between one good run and unlimited progression. This is derived from
 * the run itself: the same seed and the same decisions are the same game,
 * however many times it is sent.
 */
export function runFingerprint(
  save: Pick<RunSaveDto, "seed" | "mode" | "profileId" | "actions">,
): string {
  return fingerprint(
    canonicalJson({
      seed: save.seed,
      mode: save.mode,
      profileId: save.profileId,
      actions: save.actions,
    }),
  );
}

export function replayRun(input: unknown): ReplayResult {
  const parsed = RunSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, error: `Malformed save: ${parsed.error.issues[0]?.message ?? "?"}` };
  }

  const migration = migrate(parsed.data);
  if (!migration.ok) return { valid: false, error: migration.error };

  const save: RunSaveDto = migration.dto;

  let state = createRun({
    seed: save.seed,
    mode: save.mode,
    profileId: save.profileId,
    version: save.version,
    meta: { unlockedSkills: save.unlockedSkills, statPoints: save.statPoints },
  });

  for (let i = 0; i < save.actions.length; i++) {
    const action = save.actions[i];
    if (action === undefined) continue;

    if (state.phase.kind === "game_over") {
      return {
        valid: false,
        error: "The log continues past the end of the run",
        failedAt: i,
      };
    }

    try {
      state = applyAction(state, action as PlayerAction).state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: message, failedAt: i };
    }
  }

  return {
    valid: true,
    finished: state.phase.kind === "game_over",
    score: computeScore(state),
    stats: {
      turns: state.turn,
      sprints: Math.max(0, state.sprint - 1),
      ticketsDelivered: state.ticketsDelivered,
      commits: state.player.totalCommits,
      xp: state.xpEarned,
      hash: hashState(state),
    },
    state,
  };
}

/** Whether a save was played against the rules currently in force. */
export function isCurrentRules(save: Pick<RunSaveDto, "rules">): boolean {
  return save.rules === RULES_FINGERPRINT;
}
