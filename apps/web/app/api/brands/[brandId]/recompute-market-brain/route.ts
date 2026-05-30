// User-initiated Market Brain recompute — the "Recompute now" button hits this.
//
// Unlike the weekly cron (dispatch → after() → CRON_SECRET self-fetch), this path
// is authenticated by the user's SESSION cookie and runs the worker INLINE, then
// returns. The client awaits the response and refreshes — no after(), no internal
// self-fetch, no secret. (after() inside a server action proved unreliable on
// Vercel; a route handler the browser calls directly is the robust path.)

import { computeMarketBrainForBrand } from "@/lib/_private/market-brain-worker";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // scrape ≤5 pages × N competitors + 1 LLM call

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  const { brandId } = await ctx.params;
  if (!UUID.test(brandId)) {
    return Response.json({ error: "Invalid brand_id" }, { status: 400 });
  }

  // Authn + ownership + beta_access via the user's RLS-scoped session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "notSignedIn" }, { status: 401 });

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, industry, primary_language, accounts!inner(beta_access)")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandErr) {
    return Response.json({ error: brandErr.message }, { status: 500 });
  }
  if (!brand) return Response.json({ error: "brandNotFound" }, { status: 404 });
  if (!brand.accounts.beta_access) {
    return Response.json({ error: "noBetaAccess" }, { status: 403 });
  }

  const { data: config } = await supabase
    .from("brand_configs")
    .select("brand_voice")
    .eq("brand_id", brandId)
    .maybeSingle();

  // Ownership is proven; the worker writes market_differentiation + the
  // service-role-only scrape cache, so it needs the service-role client.
  const service = createServiceRoleClient();
  try {
    const result = await computeMarketBrainForBrand(service, {
      brand_id: brand.id,
      industry: brand.industry,
      brand_voice: config?.brand_voice ?? null,
      primary_language: brand.primary_language,
    });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[recompute-market-brain] failed for ${brandId}:`, err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
