// Daily topic-research dispatch — Vercel Cron entry (06:00 UTC).
// vercel.json schedule: "0 6 * * *"
//
// Does two things:
//   1. DELETE expired topic_candidates (cleanup, D13)
//   2. Fan out ONE function invocation per brand (await the results)
//
// Why fan-out (not inline): running all brands inside THIS one function starved
// each other — 3 concurrent web_search streams in a single lambda pushed each
// past its 240s abort, so nothing was generated (observed: only voc cards,
// tagged "deadline"). Each brand now runs in its OWN worker function
// (/api/cron/research-topics/[brandId]) with its own CPU + full 240s source
// budget. We AWAIT the fan-out (no next/server `after()`, whose lifetime was
// capped by maxDuration and silently dropped the workers for days).
//
// Self-call uses the canonical prod domain (SITE_URL), NOT VERCEL_URL — the
// deployment-specific host sits behind Deployment Protection and would 401 the
// internal fetch.
//
// SCALE CEILING: dispatch awaits all workers, so its wall ≈ slowest worker
// (~240s) regardless of brand count, BUT Vercel subrequest/concurrency limits
// make this unsafe well before ~100 brands. TODO: durable queue (Inngest is NOT
// yet an apps/web dependency) or per-brand Vercel crons before the fleet grows.

import { SITE_URL } from "@/lib/seo";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const maxDuration = 300; // awaits per-brand workers; needs full Pro budget

// Bound each worker fetch below dispatch's own 300s cap so one hung worker can't
// pin dispatch to its death.
const WORKER_FETCH_TIMEOUT_MS = 290_000;

type WorkerResult = {
  brand_id: string;
  ok: boolean;
  status: number;
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

// Base URL for the internal self-fetch into per-brand worker routes. On Vercel
// use the canonical production domain (exempt from Deployment Protection); local
// dev hits the dev server.
function resolveBaseUrl(): string {
  if (process.env.VERCEL) return SITE_URL;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

// Vercel Cron uses GET по умолчанию — но we also accept POST for manual invocation.
async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return jsonError({ error: "Unauthorized" }, 401);
  }

  const supabase = createServiceRoleClient();

  // 1) Cleanup expired candidates (cheap, fast, before fan-out so per-brand
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
  const baseUrl = resolveBaseUrl();
  const secret = process.env.CRON_SECRET!;

  // 3) Fan out one worker function per brand and AWAIT all. allSettled-style via
  //    per-brand try/catch so one brand's failure doesn't sink the others.
  const worker_results: WorkerResult[] = await Promise.all(
    brandIds.map(async (brand_id): Promise<WorkerResult> => {
      try {
        const res = await fetch(
          `${baseUrl}/api/cron/research-topics/${brand_id}`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(WORKER_FETCH_TIMEOUT_MS),
          },
        );
        const body: unknown = await res.json().catch(() => ({}));
        const b = (body ?? {}) as {
          candidates_inserted?: number;
          degraded_run?: boolean;
          error?: string;
        };
        return {
          brand_id,
          ok: res.ok,
          status: res.status,
          candidates_inserted: b.candidates_inserted ?? 0,
          degraded_run: b.degraded_run ?? !res.ok,
          error: res.ok ? undefined : (b.error ?? `HTTP ${res.status}`),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron-dispatch] fan-out failed for ${brand_id}:`, err);
        return {
          brand_id,
          ok: false,
          status: 0,
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
