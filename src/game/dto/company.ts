import { z } from "zod";

import { PROFILE_IDS, SKILL_IDS, WORLD_EVENT_IDS, type WorldEventId } from "@/game/content";
import { occupiedSeats } from "@/game/core/rules/crew";
import { applyAction, applyRound, joinCrew, leaveCrew } from "@/game/core/rules/reducer";
import { createRun, hashState } from "@/game/core/run";
import { computeScore, playerScore } from "@/game/core/score";
import type { GameEvent, PlayerAction, RunState, Seat } from "@/game/core/types";
import { InvalidActionError } from "@/game/core/types";
import { PlayerActionSchema } from "@/game/dto/run";
import { COMPANY_SAVE_VERSION, CREW_FINGERPRINT, SAVE_VERSION } from "@/game/dto/version";

/**
 * A company, as it crosses the wire and as the server stores it: a seed, who
 * founded it, and the ordered entries that happened. Like a solo save there
 * is no score in it: `replayCompany` computes one from the engine.
 */

/** Past any company the server keeps, and small enough to loop over. */
export const MAX_ENTRIES = 20_000;
const MAX_RIVALS = 64;
const MAX_SEAT = 4096;

const SeatSchema = z.number().int().min(0).max(MAX_SEAT);

const NameSchema = z.string().trim().min(3).max(24);

/** What a human may do on their own, at once. `dev_set` is the development panel's, never a company's. */
const CompanyActionSchema = PlayerActionSchema.refine((action) => action.type !== "dev_set", {
  message: "dev_set is not a company action",
});

const RoundActionsSchema = z.record(
  z.string().regex(/^\d+$/),
  z.union([CompanyActionSchema, z.literal("missed")]),
);

export const CompanyEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("join"), name: NameSchema, site: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("leave"), seat: SeatSchema }),
  /** A free action, applied at once. */
  z.object({ kind: z.literal("act"), seat: SeatSchema, action: CompanyActionSchema }),
  /** One round: every seat's turn action (or a miss) and what the world brought. */
  z.object({
    kind: z.literal("round"),
    actions: RoundActionsSchema,
    world: z.object({
      rivals: z.array(z.number().min(0).max(1e15)).max(MAX_RIVALS),
      event: z.enum(WORLD_EVENT_IDS).optional(),
    }),
  }),
]);

export const CompanySaveSchema = z.object({
  version: z.number().int().positive(),
  /** Solo rules the company was played against. */
  rules: z.string().min(1).max(16),
  /** Company rules the company was played against. */
  crew: z.string().min(1).max(16),
  seed: z.string().min(1).max(64),
  name: NameSchema,
  founder: NameSchema,
  profileId: z.enum(PROFILE_IDS),
  unlockedSkills: z.array(z.enum(SKILL_IDS)).max(SKILL_IDS.length),
  startingSkillPoints: z.number().int().min(0).max(999),
  entries: z.array(CompanyEntrySchema).max(MAX_ENTRIES),
});

export type CompanyEntry = z.infer<typeof CompanyEntrySchema>;
export type CompanySaveDto = z.infer<typeof CompanySaveSchema>;

export interface CompanySeatResult {
  seat: Seat;
  name: string;
  score: number;
  present: boolean;
}

export type CompanyReplay =
  | {
      valid: true;
      finished: boolean;
      score: number;
      seats: CompanySeatResult[];
      hash: string;
      state: RunState;
    }
  | { valid: false; error: string; failedAt?: number };

/** The company a save starts from, before its first entry. */
export function startCompany(
  save: Pick<
    CompanySaveDto,
    "seed" | "name" | "founder" | "profileId" | "unlockedSkills" | "startingSkillPoints"
  >,
): RunState {
  return createRun({
    seed: save.seed,
    mode: "multiplayer",
    profileId: save.profileId,
    version: SAVE_VERSION,
    meta: { unlockedSkills: save.unlockedSkills, startingSkillPoints: save.startingSkillPoints },
    crew: { name: save.name, founder: save.founder },
  });
}

/**
 * One entry applied: the only way a company moves, on the server, in the
 * browser and in a replay. Throws `InvalidActionError` on anything the rules
 * refuse.
 */
export function applyEntry(
  state: RunState,
  entry: CompanyEntry,
): { state: RunState; events: GameEvent[] } {
  switch (entry.kind) {
    case "join":
      return joinCrew(state, { name: entry.name, site: entry.site });
    case "leave":
      return leaveCrew(state, entry.seat);
    case "act":
      return applyAction(state, entry.action as PlayerAction, entry.seat);
    case "round": {
      const actions: Record<Seat, PlayerAction | "missed"> = {};
      for (const [seat, action] of Object.entries(entry.actions)) {
        actions[Number(seat)] = action as PlayerAction | "missed";
      }
      const event: WorldEventId | undefined = entry.world.event;
      return applyRound(state, {
        actions,
        world: { rivals: entry.world.rivals, ...(event === undefined ? {} : { event }) },
      });
    }
  }
}

/** What each human of a company has brought it, those who left included. */
export function seatResults(state: RunState): CompanySeatResult[] {
  const present = occupiedSeats(state).map((seat) => ({
    seat,
    name: state.crew?.seats[seat]?.name ?? "",
    score: playerScore(state, seat),
    present: true,
  }));
  const gone = Object.entries(state.crew?.left ?? {}).map(([seat, who]) => ({
    seat: Number(seat),
    name: who.name,
    score: who.score,
    present: false,
  }));
  return [...present, ...gone].sort((a, b) => a.seat - b.seat);
}

/**
 * Plays a stored company back, optionally from a state it was compacted to.
 * The server's anti-drift check and its recovery after a restart: the final
 * hash must equal the one it broadcast.
 */
export function replayCompany(input: unknown, from?: RunState): CompanyReplay {
  const parsed = CompanySaveSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, error: `Malformed company: ${parsed.error.issues[0]?.message ?? "?"}` };
  }
  const save = parsed.data;
  if (save.version !== COMPANY_SAVE_VERSION) {
    return { valid: false, error: `No migration from company version ${save.version}` };
  }
  if (save.crew !== CREW_FINGERPRINT) {
    return { valid: false, error: "This company was played against older rules" };
  }

  let state = from ?? startCompany(save);
  for (let i = 0; i < save.entries.length; i += 1) {
    const entry = save.entries[i];
    if (entry === undefined) continue;
    if (state.phase.kind === "game_over") {
      return { valid: false, error: "The log continues past the end of the company", failedAt: i };
    }
    try {
      state = applyEntry(state, entry).state;
    } catch (error) {
      if (!(error instanceof InvalidActionError) && !(error instanceof Error)) throw error;
      return { valid: false, error: error.message, failedAt: i };
    }
  }

  return {
    valid: true,
    finished: state.phase.kind === "game_over",
    score: computeScore(state),
    seats: seatResults(state),
    hash: hashState(state),
    state,
  };
}
