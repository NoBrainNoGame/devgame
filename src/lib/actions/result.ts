import type { $ZodIssue } from "zod/v4/core";

/**
 * What a server action hands back.
 *
 * Actions never throw across the boundary: a thrown error in a Server Action
 * reaches the client as an opaque digest in production, which tells the player
 * nothing and tells us nothing either. Everything becomes a typed code the UI
 * can translate.
 */

export type ActionErrorCode =
  | "unauthorized"
  | "invalid"
  | "rate-limited"
  | "rejected"
  | "conflict"
  | "internal";

export interface ActionError {
  code: ActionErrorCode;
  /** English, for logs. The UI shows its own translation of `code`. */
  message: string;
  issues?: $ZodIssue[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T>(
  code: ActionErrorCode,
  message: string,
  issues?: $ZodIssue[],
): ActionResult<T> {
  return { ok: false, error: issues === undefined ? { code, message } : { code, message, issues } };
}

/**
 * Wraps an action body so an unexpected throw becomes an `internal` result
 * instead of a digest. The original is logged, because that is the only place
 * it still exists.
 */
export async function guard<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    console.error("Unhandled error in a server action:", error);
    return fail("internal", "Something went wrong. Try again.");
  }
}
