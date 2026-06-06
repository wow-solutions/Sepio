// Daily topic-research dispatch — Vercel Cron entry (06:00 UTC).
// vercel.json schedule: "0 6 * * *"
//
// Does two things:
//   1. DELETE expired topic_candidates (cleanup, D13)
//   2. Process each active brand INLINE via runBrandResearch, in parallel.
//
// History: the old design returned 200 instantly and fanned out to per-brand
// worker routes inside next/server `after()`. On Vercel `after()` is bounded by
// THIS route's maxDuration (was 60s), but the workers need ~180-260s — so the
// fan-out was torn down before the workers inserted anything. The pool went
// stale for days while the cron "succeeded". We now process brands inline
// (3 active brands, each ~180-240s, run in parallel → wall ≈ slowest brand,
// well under the 300s cap) and AWAIT real results, so a zero-insert run is
// visible immediately instead of silently swallowed.
//
// SCALE CEILING: inline-parallel holds while one wave of brands fits in 300s.
// TODO (before ~8-10 active brands): move fan-out to a durable queue (Inngest is
// NOT currently a dependency of apps/web — adding it is real work) or per-brand
// Vercel crons. This is deliberately a small-fleet fix.

import { runBrandResearch } from "@/lib/_private/cron-worker";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // inline processing; needs the full Pro budget

// Per-brand wall budget. Brands run in parallel, so this is roughly the whole
// run's wall time. Leaves ~50s headroom under maxDuration for cleanup + jitter.
const PER_BRAND_BUDGET_MS = 240_000;

type WorkerResult = {
  brand_id: string;
  ok: boolean;
  candidates_inserted: number;
  degraded_run: boolean;
  error?: string;
};

type DispatchResponse = {
  expired_deleted: number;
  brands_dispatched: number;
  total_candidates_inserted: number;
  worker_results: WorkerResult[];
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

// Vercel Cron uses GET по умолчанию — но we also accept POST for manual invocation.
async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleClient();

  // 1) Cleanup expired candidates (cheap, fast, before processing so per-brand
  //    pool comparisons see clean state).
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

  // 3) Process all brands inline, in parallel. allSettled so one brand's failure
  //    doesn't sink the others; we attribute per-brand outcomes in the response.
  const worker_results: WorkerResult[] = await Promise.all(
    brandIds.map(async (brand_id): Promise<WorkerResult> => {
      try {
        const r = await runBrandResearch(supabase, brand_id, {
          deadlineMs: PER_BRAND_BUDGET_MS,
          signal: AbortSignal.timeout(PER_BRAND_BUDGET_MS),
        });
        return {
          brand_id,
          ok: true,
          candidates_inserted: r.candidates_inserted,
          degraded_run: r.degraded_run,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron-dispatch] brand ${brand_id} failed:`, err);
        return {
          brand_id,
          ok: false,
          candidates_inserted: 0,
          degraded_run: true,
          error: msg,
        };
      }
    }),
  );

  const total_candidates_inserted = worker_results.reduce(
    (sum, r) => sum + r.candidates_inserted,
    0,
  );

  // Zero-insert / degraded alarm — the failure shape that hid for 3 days was a
  // run that "succeeds" with 0 candidates. Make it loud (Sentry picks up
  // console.error in prod).
  if (brandIds.length > 0 && total_candidates_inserted === 0) {
    console.error(
      "[cron-dispatch] ZERO INSERT across all brands",
      JSON.stringify(worker_results),
    );
  } else {
    const broken = worker_results.filter(
      (r) => !r.ok || (r.degraded_run && r.candidates_inserted === 0),
    );
    if (broken.length > 0) {
      console.error(
        "[cron-dispatch] brands with no fresh candidates:",
        JSON.stringify(broken),
      );
    }
  }

  const body: DispatchResponse = {
    expired_deleted: deletedCount ?? 0,
    brands_dispatched: brandIds.length,
    total_candidates_inserted,
    worker_results,
  };

  return Response.json(body);
}

export const GET = handle;
export const POST = handle;
