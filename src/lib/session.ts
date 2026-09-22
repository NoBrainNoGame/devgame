import "@/lib/server-only";

import { headers } from "next/headers";

import { auth, type Session } from "@/lib/auth";

/**
 * The current session, or null. Every server-side authorisation check starts
 * here — never trust a user id supplied by the client.
 */
export async function getSession(): Promise<Session | null> {
  if (auth === null) return null;
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/** Throws when unauthenticated. For route handlers and server actions. */
export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (userId === null) throw new UnauthorizedError();
  return userId;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}
