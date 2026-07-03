// Weekly Market Brain dispatch — Vercel Cron entry.
// vercel.json schedule: "0 5 * * 1" (Mondays 05:00 UTC, under the 7d cache TTL).
//
// Does three things, all fast:
//   1. Sweep expired market_scrape_cache rows (global cleanup, once — avoids N
//      workers racing on the same DELETE).
//   2. Enumerate beta_access brands that have ≥1 approved competitor.
//   3. Fire-and-forget fetch per-brand worker route (own 300s function instance).
//
// Mirrors research-topics-dispatch (after() detaches fan-out; dispatch returns
// 200 quickly). The onboarding trigger (PR-C) hits the per-brand route directly.

import { after } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sweepExpiredScrapeCache } from "@/lib/market-brain/scrape-cache";

export const maxDuration = 60; // dispatch is fast; cap to 60s

type DispatchResponse = {
  cache_swept: number;
  brands_dispatched: number;
  brand_ids: string[];
};

type ErrorBody = { error: string };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

// Resolve our own deployment URL for fire-and-forget fetch into per-brand routes.
// Same shape as research-topics-dispatch (VERCEL_URL on prod, 127.0.0.1 locally
// to dodge the IPv6 localhost resolution issue).
function resolveBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleClient();

  // 1) Global cache sweep before fan-out — cheap, keeps workers seeing clean state.
  let cacheSwept = 0;
  try {
    const { deleted } = await sweepExpiredScrapeCache(supabase);
    cacheSwept = deleted;
  } catch (err) {
    // Non-fatal — proceed with dispatch. Sentry picks this up.
    console.error("[market-brain-dispatch] cache sweep failed:", err);
  }

  // 2a) beta_access brands (inner join accounts), wizard done, not deleted.
  const { data: betaBrands, error: brandsErr } = await supabase
    .from("brands")
    .select("id, accounts!inner(beta_access)")
    .eq("accounts.beta_access", true)
    .eq("wizard_completed", true)
    .is("deleted_at", null);

  if (brandsErr) {
    return jsonError({ error: `Brands enumeration failed: ${brandsErr.message}` }, 500);
  }

  const betaBrandIds = (betaBrands ?? []).map((b) => b.id);

  // 2b) Of those, only brands with ≥1 approved competitor (nothing to compute
  //     otherwise). A brand that drops from 1→0 competitors won't be re-dispatched;
  //     its stale row is a dogfood-acceptable edge (TODO multi-tenant).
  let brandIds: string[] = [];
  if (betaBrandIds.length > 0) {
    const { data: withCompetitors, error: compErr } = await supabase
      .from("market_competitors")
      .select("brand_id")
      .eq("status", "approved")
      .in("brand_id", betaBrandIds);

    if (compErr) {
      return jsonError({ error: `Competitor enumeration failed: ${compErr.message}` }, 500);
    }
    brandIds = [...new Set((withCompetitors ?? []).map((c) => c.brand_id))];
  }

  // 3) Fire-and-forget fan-out via after() — each fetch invokes the per-brand
  //    worker in its own Vercel function instance.
  if (brandIds.length > 0) {
    const baseUrl = resolveBaseUrl();
    const secret = process.env.CRON_SECRET!;
    after(async () => {
      const fetches = brandIds.map((id) =>
        fetch(`${baseUrl}/api/cron/market-brain/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        }).catch((err) => {
          console.error(`[market-brain-dispatch] fan-out fetch failed for ${id}:`, err);
        }),
      );
      await Promise.allSettled(fetches);
    });
  }

  const body: DispatchResponse = {
    cache_swept: cacheSwept,
    brands_dispatched: brandIds.length,
    brand_ids: brandIds,
  };

  return Response.json(body);
}

// Vercel Cron uses GET; we also accept POST for manual invocation.
export const GET = handle;
export const POST = handle;
