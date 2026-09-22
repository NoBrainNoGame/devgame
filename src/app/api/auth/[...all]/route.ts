import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/** Offline there is nothing to sign in to: the whole route answers 404. */
const handlers =
  auth === null ? { GET: notConfigured, POST: notConfigured } : toNextJsHandler(auth.handler);

function notConfigured(): Response {
  return new Response("Authentication is not configured on this instance.", { status: 404 });
}

export const { GET, POST } = handlers;
