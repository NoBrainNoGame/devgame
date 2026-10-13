import "@/lib/server-only";

/**
 * What one socket, one player and one world may do, in one place so the
 * numbers can be read and argued about together.
 */
export const REALTIME_LIMITS = {
  /** Messages a socket may send in a window; past it the socket is closed. */
  messages: { limit: 30, windowMs: 10_000 },
  /** Open sockets per profile (a second tab, a phone). */
  socketsPerProfile: 3,
  /** A frame larger than this is not read. */
  frameBytes: 16 * 1024,
  /** A socket that has not said hello by then is closed. */
  helloMs: 5_000,
  /** Companies a world holds at once. */
  companiesPerWorld: 64,
  /** Rounds a company may play, after which it closes: a log cannot grow forever. */
  maxRounds: 2000,
  /** Rounds between two compactions of a company's state. */
  snapshotEvery: 50,
  /** Failed writes in a row after which the clock pauses rather than lose more. */
  failedWritesBeforePause: 10,
  /** Longest a company's or a player's name may be, and the shortest. */
  companyName: { min: 3, max: 24 },
} as const;
