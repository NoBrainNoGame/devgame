import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { defaultDisplayName } from "@/lib/profile/default-name";
import { hit, LIMITS, rateKey, tooManyRequests } from "@/lib/rate-limit";
import { mintTicket } from "@/lib/realtime/ticket";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function refuse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * A ticket for the realtime server. It is a public endpoint like any other,
 * so every check is made here and none is left to the button that calls it:
 * multiplayer on, a signed-in player (a guest has nobody to be in a company),
 * not suspended, and a profile row to name them by.
 *
 * A player who signs in and heads straight for multiplayer has no profile yet
 * (solo creates it on its first sync), so one is made here with the default
 * name rather than refused: a refusal read as a server that never answers.
 */
export async function GET(request: Request): Promise<Response> {
  if (!env.MULTI || env.BETTER_AUTH_SECRET === undefined) {
    return refuse(404, "not-found", "Multiplayer is not available here");
  }

  const session = await getSession();
  if (session === null) return refuse(401, "unauthorized", "Sign in to play with others");

  const verdict = hit(
    rateKey("realtime-ticket", { userId: session.user.id }, request),
    LIMITS.realtimeTicket,
  );
  if (!verdict.allowed) return tooManyRequests(verdict);

  const select = { id: true, displayName: true, bannedAt: true } as const;
  const profile =
    (await prisma.profile.findUnique({ where: { userId: session.user.id }, select })) ??
    (await prisma.profile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, displayName: await defaultDisplayName(session.user.id) },
      update: {},
      select,
    }));
  if (profile.bannedAt !== null) return refuse(403, "suspended", "This account is suspended");

  const ticket = mintTicket(env.BETTER_AUTH_SECRET, {
    userId: session.user.id,
    profileId: profile.id,
    name: profile.displayName,
  });
  return Response.json({ ticket, url: env.REALTIME_WS_URL });
}
