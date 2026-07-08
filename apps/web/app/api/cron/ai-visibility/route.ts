// Monthly AI-visibility dispatch — Vercel Cron entry.
// vercel.json schedule: "0 7 1 * *" (1st of the month, 07:00 UTC).
//
// Mirrors the market-brain dispatch: enumerate beta_access brands (wizard done,
// not deleted) and fire-and-forget a per-brand worker route (own 300s instance)
// via after(). Dispatch returns 200 quickly; each worker measures independently.

import { after } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SITE_URL } from "@/lib/seo";

export const maxDuration = 60; // dispatch is fast

type DispatchResponse = {
  brands_dispatched: number;
  brand_ids: string[];
};

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

// Self-call uses the canonical prod domain (SITE_URL), NOT VERCEL_URL — the
// per-deployment host sits behind Deployment Protection and would 401 the
// worker fetches while the dispatch still returns 200 (Codex P1; same fix as
// research-topics-dispatch).
function resolveBaseUrl(): string {
  if (process.env.VERCEL) return SITE_URL;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return jsonError("Unauthorized", 401);

  const supabase = createServiceRoleClient();

  const { data: betaBrands, error: brandsErr } = await supabase
    .from("brands")
    .select("id, accounts!inner(beta_access)")
    .eq("accounts.beta_access", true)
    .eq("wizard_completed", true)
    .is("deleted_at", null);

  if (brandsErr) {
    return jsonError(`Brands enumeration failed: ${brandsErr.message}`, 500);
  }

  const brandIds = (betaBrands ?? []).map((b) => b.id);

  if (brandIds.length > 0) {
    const baseUrl = resolveBaseUrl();
    const secret = process.env.CRON_SECRET!;
    after(async () => {
      const fetches = brandIds.map((id) =>
        fetch(`${baseUrl}/api/cron/ai-visibility/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        }).catch((err) => {
          console.error(`[ai-visibility-dispatch] fan-out failed for ${id}:`, err);
        }),
      );
      await Promise.allSettled(fetches);
    });
  }

  const body: DispatchResponse = {
    brands_dispatched: brandIds.length,
    brand_ids: brandIds,
  };
  return Response.json(body);
}

// Vercel Cron uses GET; also accept POST for manual invocation.
export const GET = handle;
export const POST = handle;
