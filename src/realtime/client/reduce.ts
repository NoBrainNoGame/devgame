import type { PlayerAction } from "@/game/core/types";
import type {
  AppliedEntryDto,
  LobbyCompanyDto,
  MemberDto,
  ServerMessage,
} from "@/game/dto/realtime";

/**
 * What the browser knows of the realtime world, and the one pure function
 * that moves it. Every frame the server sends, and everything the page does
 * to the connection, is an event; the state is whatever folding them in
 * order gives. No clock, no socket, no React in here — which is what lets it
 * be tested by feeding it frames.
 */

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "outdated"
  | "disabled";

export interface Joined {
  companyId: string;
  seat: number;
  site: string;
  start: Extract<ServerMessage, { type: "company.joined" }>["start"];
  snapshot?: Extract<ServerMessage, { type: "company.joined" }>["snapshot"];
  entries: AppliedEntryDto[];
}

export interface RoundView {
  round: number;
  /** Epoch ms on the server's clock. */
  deadline: number;
  /** Seats that have sent their action this round. */
  sent: number[];
  /** What this player chose, shown pending until the deadline; changeable. */
  mine: PlayerAction | null;
  acknowledged: boolean;
}

export interface QuestionView {
  kind: "relic" | "event";
  options: string[];
  deadline: number;
  votes: Record<string, number>;
  myVote: string | null;
  /** Set when it is settled, until the next one opens: the announcement. */
  result: { choice: string; votes: Record<string, number> } | null;
}

export interface ResolvedView {
  round: number;
  substituted: number[];
  misses: Record<string, number>;
  autopilot: number[];
}

export interface RealtimeError {
  code: string;
  message: string;
  at: number;
}

export interface RealtimeState {
  connection: ConnectionStatus;
  attempt: number;
  me: { profileId: string; name: string } | null;
  /** Server clock minus local clock, in ms: add it to `Date.now()` to read the server's time. */
  clockOffset: number;
  roundSeconds: number;
  lobby: {
    companies: LobbyCompanyDto[];
    waiting: { profileId: string; name: string }[];
    waitingYou: boolean;
  } | null;
  join: Joined | null;
  /** Bumped when the company is sent again (a join, a resync): the stage remounts on it. */
  mountKey: number;
  members: MemberDto[];
  /** Entries received and not yet applied to the stage, in arrival order. */
  inbox: AppliedEntryDto[];
  /** The last sequence number the stage has applied. */
  appliedSeq: number;
  round: RoundView | null;
  resolved: ResolvedView | null;
  question: QuestionView | null;
  ranking: Extract<ServerMessage, { type: "ranking" }> | null;
  closed: "dissolved" | "abandoned" | "shutdown" | null;
  errors: RealtimeError[];
}

export const MAX_ERRORS = 5;

export function initialRealtimeState(): RealtimeState {
  return {
    connection: "idle",
    attempt: 0,
    me: null,
    clockOffset: 0,
    roundSeconds: 30,
    lobby: null,
    join: null,
    mountKey: 0,
    members: [],
    inbox: [],
    appliedSeq: 0,
    round: null,
    resolved: null,
    question: null,
    ranking: null,
    closed: null,
    errors: [],
  };
}

export type RealtimeEvent =
  | { type: "server"; message: ServerMessage; receivedAt: number }
  | { type: "connection"; status: ConnectionStatus; attempt?: number }
  /** The player picked (or cleared, with null) this round's turn action. */
  | { type: "chose"; action: PlayerAction | null }
  | { type: "voted"; choice: string }
  /** The stage applied entries up to this sequence number. */
  | { type: "applied"; seq: number }
  | { type: "dismissed"; at: number }
  /** The stage's state disagreed with the server's hash: the company will be sent again. */
  | { type: "desync" };

function lastSeq(joined: Joined): number {
  return joined.entries[joined.entries.length - 1]?.seq ?? joined.snapshot?.seq ?? 0;
}

export function reduce(state: RealtimeState, event: RealtimeEvent): RealtimeState {
  switch (event.type) {
    case "connection":
      return {
        ...state,
        connection: event.status,
        attempt: event.attempt ?? (event.status === "open" ? 0 : state.attempt),
      };
    case "chose":
      return state.round === null
        ? state
        : { ...state, round: { ...state.round, mine: event.action } };
    case "voted":
      return state.question === null
        ? state
        : { ...state, question: { ...state.question, myVote: event.choice } };
    case "applied":
      return {
        ...state,
        appliedSeq: Math.max(state.appliedSeq, event.seq),
        inbox: state.inbox.filter((row) => row.seq > event.seq),
      };
    case "dismissed":
      return { ...state, errors: state.errors.filter((error) => error.at !== event.at) };
    case "desync":
      return { ...state, inbox: [] };
    case "server":
      return reduceServer(state, event.message, event.receivedAt);
  }
}

function reduceServer(state: RealtimeState, message: ServerMessage, at: number): RealtimeState {
  switch (message.type) {
    case "welcome":
      return {
        ...state,
        me: message.you,
        roundSeconds: message.roundSeconds,
        clockOffset: message.now - at,
      };

    case "lobby.state":
      // A player with a seat is not in the lobby: a late lobby frame must not undo it.
      return {
        ...state,
        lobby: {
          companies: message.companies,
          waiting: message.waiting,
          waitingYou: message.waitingYou,
        },
      };

    case "company.joined": {
      const join: Joined = {
        companyId: message.companyId,
        seat: message.seat,
        site: message.site,
        start: message.start,
        entries: message.entries,
        ...(message.snapshot === undefined ? {} : { snapshot: message.snapshot }),
      };
      return {
        ...state,
        join,
        mountKey: state.mountKey + 1,
        members: message.members,
        inbox: [],
        appliedSeq: lastSeq(join),
        round:
          message.round === undefined
            ? null
            : { ...message.round, sent: [], mine: null, acknowledged: false },
        resolved: null,
        question: null,
        closed: null,
      };
    }

    case "entry.applied":
      return state.join === null
        ? state
        : {
            ...state,
            inbox: queue(state, { seq: message.seq, entry: message.entry, hash: message.hash }),
          };

    case "round.resolved":
      return {
        ...state,
        inbox: queue(state, { seq: message.seq, entry: message.entry, hash: message.hash }),
        resolved: {
          round: state.round?.round ?? 0,
          substituted: message.substituted,
          misses: message.misses,
          autopilot: message.autopilot,
        },
        // The next round opens with its own frame; until then there is nothing to choose.
        round: null,
      };

    case "round.open":
      return {
        ...state,
        round: {
          round: message.round,
          deadline: message.deadline,
          sent: [],
          mine: null,
          acknowledged: false,
        },
      };

    case "round.progress":
      return state.round === null || state.round.round !== message.round
        ? state
        : { ...state, round: { ...state.round, sent: message.sent } };

    case "round.ack":
      return state.round === null || state.round.round !== message.round
        ? state
        : { ...state, round: { ...state.round, acknowledged: true } };

    case "question.open":
      return {
        ...state,
        question: {
          kind: message.kind,
          options: message.options,
          deadline: message.deadline,
          votes: {},
          myVote: null,
          result: null,
        },
      };

    case "question.votes":
      return state.question === null
        ? state
        : { ...state, question: { ...state.question, votes: message.votes } };

    case "question.result":
      return state.question === null
        ? state
        : {
            ...state,
            question: {
              ...state.question,
              result: { choice: message.choice, votes: message.votes },
            },
          };

    case "seat.changed": {
      if (
        state.me !== null &&
        message.member.profileId === state.me.profileId &&
        message.change === "left"
      ) {
        // The stage is over for this player: back to the lobby.
        return { ...state, join: null, members: [], inbox: [], round: null, question: null };
      }
      const others = state.members.filter((member) => member.seat !== message.member.seat);
      return {
        ...state,
        members:
          message.change === "left"
            ? others
            : [...others, message.member].sort((a, b) => a.seat - b.seat),
      };
    }

    case "ranking":
      return { ...state, ranking: message };

    case "company.closed":
      return { ...state, closed: message.reason, round: null, question: null };

    case "error":
      return {
        ...state,
        errors: [...state.errors, { code: message.code, message: message.message, at }].slice(
          -MAX_ERRORS,
        ),
      };

    case "pong":
      return state;
  }
}

/** Appends an entry to the inbox unless it is already there or already applied. */
function queue(state: RealtimeState, row: AppliedEntryDto): AppliedEntryDto[] {
  if (row.seq <= state.appliedSeq) return state.inbox;
  if (state.inbox.some((queued) => queued.seq === row.seq)) return state.inbox;
  return [...state.inbox, row].sort((a, b) => a.seq - b.seq);
}
