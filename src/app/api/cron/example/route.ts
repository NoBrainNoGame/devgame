import { handleCronRequest } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Self-hosted behind your own scheduler there is no platform timeout, so this
 * ceiling is yours to choose. It still matters on Vercel, where 300 is the cap.
 */
export const maxDuration = 300;

/**
 * Template for a scheduled job — copy it, rename the directory, delete this one.
 *
 * Both verbs are handled because schedulers disagree: Vercel Cron sends GET,
 * most others POST. See docs/hosting.md for wiring it to Coolify's scheduled
 * tasks with the CRON_SECRET.
 *
 * Make the job idempotent. Schedulers retry, overlap, and fire twice more often
 * than anyone expects.
 */
async function run(): Promise<{ message: string }> {
  return { message: "Replace me with real work." };
}

async function handle(request: Request): Promise<Response> {
  return handleCronRequest(request, run);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
