import { env } from "@/lib/env";
import { hit, LIMITS, rateKey } from "@/lib/rate-limit";
import { VisitSchema } from "@/lib/visits/paths";
import { recordVisit } from "@/lib/visits/record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The page-view beacon. Always answers 204 and never says why: a counter is
 * not something a page should wait on or learn from. Offline there is no
 * table to count into; a browser asking not to be tracked is not counted;
 * a body that is too big, malformed, or too frequent from one address is
 * dropped on the floor.
 */
const MAX_BODY_BYTES = 512;

export async function POST(request: Request): Promise<Response> {
  const done = new Response(null, { status: 204 });
  if (!env.ONLINE) return done;
  if (request.headers.get("sec-gpc") === "1") return done;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) return done;
  if (!hit(rateKey("visit", {}, request), LIMITS.visit).allowed) return done;

  try {
    const parsed = VisitSchema.safeParse(await request.json());
    if (parsed.success) await recordVisit(parsed.data);
  } catch (error) {
    console.error("visit beacon:", error);
  }
  return done;
}
