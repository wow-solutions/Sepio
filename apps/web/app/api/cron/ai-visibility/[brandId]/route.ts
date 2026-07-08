// Per-brand AI-visibility worker — invoked by /api/cron/ai-visibility dispatch
// via fire-and-forget fetch. Auth: Bearer CRON_SECRET shared with dispatch. Each
// request is its own Vercel function instance with its own 300s timeout.

import { runAiVisibility } from "@/lib/_private/ai-visibility/run";
import { authorizeCron } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // 60 probes across 4 engines under a 250s deadline

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number, brandId?: string): Response {
  return Response.json({ error, ...(brandId ? { brand_id: brandId } : {}) }, { status });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  if (!authorizeCron(request)) return jsonError("Unauthorized", 401);

  const { brandId } = await ctx.params;
  if (!UUID.test(brandId)) return jsonError("Invalid brand_id", 400);

  const supabase = createServiceRoleClient();

  // Defence in depth: confirm the brand still has beta_access in case the flag
  // flipped between dispatch and worker, or the worker is hit directly.
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, accounts!inner(beta_access)")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandErr) {
    return jsonError(`Brand fetch failed: ${brandErr.message}`, 500, brandId);
  }
  if (!brand) return jsonError("Brand not found or deleted", 404, brandId);
  if (!brand.accounts.beta_access) {
    return jsonError("Account lacks beta_access", 403, brandId);
  }

  try {
    const result = await runAiVisibility(supabase, brandId);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-visibility] worker failed for brand ${brandId}:`, err);
    return jsonError(msg, 500, brandId);
  }
}
