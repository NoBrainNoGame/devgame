import { z } from "zod";

import { RELIC_IDS } from "@/game/content";
import { CompanyEntrySchema, CompanyNameSchema } from "@/game/dto/company";
import { PlayerActionSchema } from "@/game/dto/run";

/**
 * What crosses the WebSocket between a browser and the realtime server.
 *
 * Both ends parse every frame with these schemas, so a malformed or
 * oversized message is an error at the door and never a surprise inside the
 * rules. The engine's `dev_set` (the development panel) is refused on the
 * wire, and so is anything shaped like a score: a company's score is whatever
 * the engine computes from its log.
 */

/** Bumped by hand when a frame changes shape; a client and a server on different ones refuse each other. */
export const PROTOCOL_VERSION = 1;

/** A frame larger than this is not read: the server closes the socket. */
export const MAX_FRAME_BYTES = 16 * 1024;

const SeatSchema = z.number().int().min(0).max(4096);
const IdSchema = z.string().min(1).max(64);

/** A free action or a turn action. `dev_set` has no place in a company. */
const WireActionSchema = PlayerActionSchema.refine((action) => action.type !== "dev_set", {
  message: "dev_set is not a company action",
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    protocol: z.number().int(),
    rules: z.string().max(16),
    crew: z.string().max(16),
  }),
  z.object({ type: z.literal("lobby.join") }),
  z.object({ type: z.literal("lobby.wait") }),
  z.object({ type: z.literal("lobby.unwait") }),
  z.object({ type: z.literal("company.create"), name: CompanyNameSchema }),
  z.object({ type: z.literal("company.join"), companyId: IdSchema }),
  /** A seated player asks a waiting one to join their site. */
  z.object({ type: z.literal("company.recruit"), profileId: IdSchema }),
  z.object({ type: z.literal("seat.leave") }),
  /** A free action, applied at once. */
  z.object({ type: z.literal("company.act"), action: WireActionSchema }),
  /** The turn action for a round: changeable until the deadline. */
  z.object({
    type: z.literal("round.act"),
    round: z.number().int().min(0),
    action: WireActionSchema,
  }),
  /** An answer to the company's question: a relic id, or an event's choice id. */
  z.object({ type: z.literal("question.vote"), choice: z.string().min(1).max(64) }),
  /** The client lost track: here is the last entry it applied and the state's hash there. */
  z.object({ type: z.literal("resync"), seq: z.number().int().min(0), hash: z.string().max(16) }),
  z.object({ type: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

export const SeatStatusSchema = z.enum(["online", "offline", "autopilot"]);
export type SeatStatus = z.infer<typeof SeatStatusSchema>;

const MemberSchema = z.object({
  seat: SeatSchema,
  profileId: IdSchema,
  name: z.string(),
  site: z.string(),
  status: SeatStatusSchema,
});
export type MemberDto = z.infer<typeof MemberSchema>;

const LobbyCompanySchema = z.object({
  id: IdSchema,
  name: z.string(),
  members: z.number().int().min(0),
  freeSeats: z.number().int().min(0),
  score: z.number().int().min(0),
  rank: z.number().int().min(1),
});
export type LobbyCompanyDto = z.infer<typeof LobbyCompanySchema>;

const WaitingSchema = z.object({ profileId: IdSchema, name: z.string() });

const RankedCompanySchema = z.object({
  id: IdSchema,
  name: z.string(),
  score: z.number().int().min(0),
  members: z.number().int().min(0),
});
const RankedPlayerSchema = z.object({
  profileId: IdSchema,
  name: z.string(),
  company: z.string(),
  score: z.number().int().min(0),
});

const AppliedEntrySchema = z.object({
  seq: z.number().int().min(1),
  entry: CompanyEntrySchema,
  hash: z.string().max(16),
});
export type AppliedEntryDto = z.infer<typeof AppliedEntrySchema>;

export const QuestionKindSchema = z.enum(["relic", "event"]);

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    protocol: z.number().int(),
    /** The server's clock in epoch ms, for the countdown's offset. */
    now: z.number(),
    roundSeconds: z.number().int().min(1),
    you: z.object({ profileId: IdSchema, name: z.string() }),
  }),
  z.object({
    type: z.literal("lobby.state"),
    companies: z.array(LobbyCompanySchema),
    waiting: z.array(WaitingSchema),
    waitingYou: z.boolean(),
  }),
  z.object({
    type: z.literal("company.joined"),
    companyId: IdSchema,
    seat: SeatSchema,
    site: z.string(),
    /** How the company starts from its first entry, so the client can rebuild it. */
    start: z.object({
      seed: z.string(),
      name: z.string(),
      founder: z.string(),
      profileId: z.string(),
      unlockedSkills: z.array(z.string()),
      startingSkillPoints: z.number().int(),
    }),
    /** A compacted state to start from instead of the beginning; `seq` is the entry it stands after. */
    snapshot: z
      .object({ seq: z.number().int().min(0), state: z.record(z.string(), z.unknown()) })
      .optional(),
    /** Entries after the snapshot (or after the beginning, without one). */
    entries: z.array(AppliedEntrySchema),
    members: z.array(MemberSchema),
    /** The round under way, if any. */
    round: z.object({ round: z.number().int(), deadline: z.number() }).optional(),
  }),
  z.object({ type: z.literal("entry.applied"), ...AppliedEntrySchema.shape }),
  z.object({ type: z.literal("round.open"), round: z.number().int(), deadline: z.number() }),
  /** Who has sent their action this round, not what: the round bar's dots. */
  z.object({
    type: z.literal("round.progress"),
    round: z.number().int(),
    sent: z.array(SeatSchema),
  }),
  z.object({ type: z.literal("round.ack"), round: z.number().int() }),
  z.object({
    type: z.literal("round.resolved"),
    ...AppliedEntrySchema.shape,
    /** Seats whose chosen action was replaced by the supervisor's at resolution. */
    substituted: z.array(SeatSchema),
    /** Rounds missed in a row, by seat. */
    misses: z.record(z.string(), z.number().int()),
    autopilot: z.array(SeatSchema),
  }),
  z.object({
    type: z.literal("question.open"),
    kind: QuestionKindSchema,
    /** Relic ids, or the event's choice ids. */
    options: z.array(z.string()),
    deadline: z.number(),
  }),
  z.object({
    type: z.literal("question.result"),
    choice: z.string(),
    votes: z.record(z.string(), z.number().int()),
  }),
  z.object({ type: z.literal("question.votes"), votes: z.record(z.string(), z.number().int()) }),
  z.object({
    type: z.literal("seat.changed"),
    member: MemberSchema,
    change: z.enum(["joined", "left", "status"]),
  }),
  z.object({
    type: z.literal("ranking"),
    companies: z.array(RankedCompanySchema),
    players: z.array(RankedPlayerSchema),
    mine: z.object({
      companyId: z.string().nullable(),
      companyRank: z.number().int().min(0),
      companyTotal: z.number().int().min(0),
      playerRank: z.number().int().min(0),
      playerTotal: z.number().int().min(0),
    }),
  }),
  z.object({
    type: z.literal("company.closed"),
    reason: z.enum(["dissolved", "abandoned", "shutdown"]),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("pong") }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage["type"];

/** Parses one text frame; null when it is not JSON or not a message of this protocol. */
export function parseClientMessage(raw: string): ClientMessage | null {
  return parseWith(ClientMessageSchema, raw);
}

export function parseServerMessage(raw: string): ServerMessage | null {
  return parseWith(ServerMessageSchema, raw);
}

function parseWith<T>(schema: z.ZodType<T>, raw: string): T | null {
  if (raw.length > MAX_FRAME_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The ids a vote on the sprint bonus may name. */
export const RELIC_VOTE_IDS: readonly string[] = RELIC_IDS;
