// Per-brand Market Brain worker — invoked by /api/cron/market-brain dispatch via
// fire-and-forget fetch, OR directly by the onboarding trigger (PR-C).
//
// Auth: Bearer CRON_SECRET shared with dispatch. Each request is its own Vercel
// function instance with own 300s timeout (Pro plan).

import { computeMarketBrainForBrand } from "@/lib/_private/market-brain-worker";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // 5 min, Vercel Pro (scrape ≤5 pages × N competitors + LLM)

type ErrorBody = { error: string; brand_id?: string };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  if (!authorize(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const { brandId } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId)) {
    return jsonError({ error: "Invalid brand_id" }, 400);
  }

  const supabase = createServiceRoleClient();

  // Confirm the brand's account still has beta_access — defence in depth in case
  // the flag flipped between dispatch and worker, or the worker is hit directly.
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, industry, primary_language, accounts!inner(beta_access)")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandErr) {
    return jsonError(
      { error: `Brand fetch failed: ${brandErr.message}`, brand_id: brandId },
      500,
    );
  }
  if (!brand) {
    return jsonError({ error: "Brand not found or deleted", brand_id: brandId }, 404);
  }
  if (!brand.accounts.beta_access) {
    return jsonError({ error: "Account lacks beta_access", brand_id: brandId }, 403);
  }

  const { data: config, error: configErr } = await supabase
    .from("brand_configs")
    .select("brand_voice")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (configErr) {
    return jsonError(
      { error: `Config fetch failed: ${configErr.message}`, brand_id: brandId },
      500,
    );
  }

  let result;
  try {
    result = await computeMarketBrainForBrand(supabase, {
      brand_id: brand.id,
      industry: brand.industry,
      brand_voice: config?.brand_voice ?? null,
      primary_language: brand.primary_language,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[market-brain] worker failed for brand ${brandId}:`, err);
    return jsonError({ error: msg, brand_id: brandId }, 500);
  }

  return Response.json(result);
}
