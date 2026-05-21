// Daily topic-research dispatch — Vercel Cron entry (06:00 UTC).
// vercel.json schedule: "0 6 * * *"
//
// Does two things, both fast:
//   1. DELETE expired topic_candidates (cleanup, D13)
//   2. Enumerate active brands + fire-and-forget fetch per-brand worker route
//
// Per-brand workers run in own Vercel function instances (own 300s timeout).
// We use `after()` to detach the fetches from the response — dispatch returns
// 200 quickly, workers continue in background.

import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 60; // dispatch is fast; cap to 60s

type DispatchResponse = {
  expired_deleted: number;
  brands_dispatched: number;
  brand_ids: string[];
};

type ErrorBody = { error: string };

function jsonError(body: ErrorBody, status: number): Response {
  return Response.json(body, { status });
}

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

// Resolve our own deployment URL для fire-and-forget fetch into per-brand routes.
// Vercel provides VERCEL_URL без protocol; we add https. Local dev uses
// 127.0.0.1 explicitly (Node.js fetch on Mac sometimes resolves localhost
// to IPv6 ::1 while Next.js dev binds IPv4 — causing "TypeError: fetch failed").
function resolveBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

// Vercel Cron uses GET по умолчанию — но we also accept POST for manual invocation.
async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleClient();

  // 1) Cleanup expired candidates (cheap, fast, before fan-out so per-brand
  //    workers see clean state).
  const { count: deletedCount, error: deleteErr } = await supabase
    .from("topic_candidates")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());

  if (deleteErr) {
    console.error("[cron-dispatch] expired cleanup failed:", deleteErr);
    // Non-fatal — proceed with dispatch anyway. Sentry will pick this up.
  }

  // 2) Enumerate active brands (not deleted, wizard completed)
  const { data: brands, error: brandsErr } = await supabase
    .from("brands")
    .select("id")
    .is("deleted_at", null)
    .eq("wizard_completed", true);

  if (brandsErr) {
    return jsonError({ error: `Brands enumeration failed: ${brandsErr.message}` }, 500);
  }

  const brandIds = (brands ?? []).map((b) => b.id);
  const baseUrl = resolveBaseUrl();
  const secret = process.env.CRON_SECRET!;

  // 3) Fire-and-forget fan-out via after() — each fetch invokes per-brand worker
  //    в own Vercel function instance. We don't wait for completion (would
  //    serialize them and blow dispatch's timeout).
  if (brandIds.length > 0) {
    after(async () => {
      const fetches = brandIds.map((id) =>
        fetch(`${baseUrl}/api/cron/research-topics/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        }).catch((err) => {
          // Per-brand fetch failure: log + continue. Worker может также fail
          // internally (degraded_run handled there).
          console.error(`[cron-dispatch] fan-out fetch failed for ${id}:`, err);
        }),
      );
      await Promise.allSettled(fetches);
    });
  }

  const body: DispatchResponse = {
    expired_deleted: deletedCount ?? 0,
    brands_dispatched: brandIds.length,
    brand_ids: brandIds,
  };

  return Response.json(body);
}

export const GET = handle;
export const POST = handle;
