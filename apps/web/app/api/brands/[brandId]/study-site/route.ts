// User-initiated Client Brain "Study site" — the brand page button hits this.
//
// Authenticated by the user's SESSION cookie; runs the worker INLINE and returns
// (same robust pattern as recompute-market-brain — no after(), no self-fetch).
// UNGATED: Client Brain is the core grounding feature, not a beta experiment.

import { studyClientSiteForBrand } from "@/lib/_private/client-site-worker";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 120; // single-page fetch + one LLM call

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Worker error → HTTP status. The body carries a stable string key the panel
// translates; raw messages are never forwarded.
const STATUS: Record<string, number> = {
  invalidUrl: 400,
  noWebsite: 400,
  emptySite: 422,
  siteUnreachable: 502,
  extractFailed: 502,
  persistFailed: 500,
};

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  const { brandId } = await ctx.params;
  if (!UUID.test(brandId)) {
    return Response.json({ error: "Invalid brand_id" }, { status: 400 });
  }

  // Authn + ownership via the user's RLS-scoped session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "notSignedIn" }, { status: 401 });

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, website_url, primary_language")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandErr) {
    return Response.json({ error: brandErr.message }, { status: 500 });
  }
  if (!brand) return Response.json({ error: "brandNotFound" }, { status: 404 });
  if (!brand.website_url) {
    return Response.json({ error: "noWebsite" }, { status: STATUS.noWebsite });
  }

  // Ownership proven; the worker writes brand_configs + proof_items via service-role.
  const service = createServiceRoleClient();
  const result = await studyClientSiteForBrand(service, {
    brand_id: brand.id,
    website_url: brand.website_url,
    primary_language: brand.primary_language,
  });

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: STATUS[result.error] ?? 500 },
    );
  }
  return Response.json({ ok: true, counts: result.counts });
}
