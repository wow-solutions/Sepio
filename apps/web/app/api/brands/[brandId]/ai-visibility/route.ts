// User-initiated AI-visibility measure — the "Measure AI visibility" button hits
// this. Authenticated by the user's SESSION cookie (not CRON_SECRET), same shape
// as recompute-market-brain: session + ownership + beta gate, then run the worker
// inline with the service-role client and return the run status.

import { runAiVisibility } from "@/lib/_private/ai-visibility/run";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // 60 probes across 4 engines under a 250s deadline

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  const { brandId } = await ctx.params;
  if (!UUID.test(brandId)) return jsonError("Invalid brand_id", 400);

  // Authn + ownership + beta_access via the user's RLS-scoped session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("notSignedIn", 401);

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, accounts!inner(beta_access)")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandErr) return jsonError(brandErr.message, 500);
  if (!brand) return jsonError("brandNotFound", 404);
  if (!brand.accounts.beta_access) return jsonError("noBetaAccess", 403);

  // Ownership is proven; the worker writes ai_visibility_* (service-role-only via
  // RLS), so it needs the service-role client.
  const service = createServiceRoleClient();
  try {
    const result = await runAiVisibility(service, brandId);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-visibility] route failed for ${brandId}:`, err);
    return jsonError(msg, 500);
  }
}
