// Per-brand cron worker — invoked by /api/cron/research-topics-dispatch via
// fire-and-forget fetch (Vercel waitUntil pattern).
//
// Auth: Bearer CRON_SECRET shared с dispatch. Each request is its own Vercel
// function instance с own 300s timeout (Pro plan).

import { runBrandResearch } from "@/lib/_private/cron-worker";
import { authorizeCron } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // 5 min, Vercel Pro

// Bound the source fan-out BELOW maxDuration so a slow source (web_search has
// been ~8 min) can't make the whole run get killed at 300s with nothing saved.
// At the deadline, slow sources abort and the worker still inserts whatever the
// fast sources (dataforseo, voc) produced. This is a background cron (fire-and-
// forget from dispatch), so the wall-time only matters vs the function cap.
const SOURCE_BUDGET_MS = 250_000; // leaves ~50s under maxDuration; web_search is
// separately capped (WEB_SEARCH_TIMEOUT_MS) so source resolution keeps ~65s.

type ErrorBody = { error: string; brand_id?: string };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  if (!authorizeCron(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const { brandId } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId)) {
    return jsonError({ error: "Invalid brand_id" }, 400);
  }

  const supabase = createServiceRoleClient();

  // Brand fetch, config fetch, and the full research pipeline live in
  // runBrandResearch (shared with the dispatch cron). The source fan-out is
  // bounded below maxDuration by SOURCE_BUDGET_MS so a slow source aborts and
  // the fast ones still insert.
  let result;
  try {
    result = await runBrandResearch(supabase, brandId, {
      deadlineMs: SOURCE_BUDGET_MS,
      signal: AbortSignal.timeout(SOURCE_BUDGET_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron] research failed for brand ${brandId}:`, err);
    const status = /not found|deleted/i.test(msg) ? 404 : 500;
    return jsonError({ error: msg, brand_id: brandId }, status);
  }

  return Response.json(result);
}
