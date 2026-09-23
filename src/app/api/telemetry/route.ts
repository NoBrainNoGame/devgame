import { env } from "@/lib/env";
import { hit, LIMITS, rateKey } from "@/lib/rate-limit";
import { ingestSample } from "@/lib/telemetry/ingest";
import { RunSampleInputSchema } from "@/lib/telemetry/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The run beacon. Answers 204 whatever happens, like the page-view one:
 * the game never waits on it or learns from it. Every sample costs a
 * replay, so an address gets a few an hour and a body has a ceiling; a
 * browser asking not to be tracked sends nothing worth reading.
 */
const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  const done = new Response(null, { status: 204 });
  if (!env.ONLINE) return done;
  if (request.headers.get("sec-gpc") === "1") return done;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) return done;
  if (!hit(rateKey("telemetry", {}, request), LIMITS.telemetry).allowed) return done;

  try {
    const parsed = RunSampleInputSchema.safeParse(await request.json());
    if (parsed.success) await ingestSample(parsed.data);
  } catch (error) {
    console.error("run beacon:", error);
  }
  return done;
}
