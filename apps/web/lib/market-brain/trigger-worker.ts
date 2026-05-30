import { after } from "next/server";

// Fire-and-forget kick of the per-brand Market Brain worker. Used by the manual
// "recompute" action and the onboarding trigger (PR-C2) — both want the moat to
// recompute now without waiting out the weekly cron. Detached via after() so the
// caller (a server action) returns immediately; the worker route runs the full
// scrape+LLM pass in its own 300s function instance.
//
// Public: builds a URL + bearer-auths with CRON_SECRET. No moat logic here —
// the orchestration lives in lib/_private/market-brain-worker.ts.

// Mirror research-topics-dispatch's URL resolution (VERCEL_URL on prod, explicit
// IPv4 locally to dodge the ::1 vs 127.0.0.1 fetch issue).
function resolveBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

export function triggerMarketBrainForBrand(brandId: string): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[market-brain-trigger] CRON_SECRET missing; skipping trigger");
    return;
  }
  const baseUrl = resolveBaseUrl();
  after(async () => {
    await fetch(`${baseUrl}/api/cron/market-brain/${brandId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }).catch((err) => {
      console.error(`[market-brain-trigger] failed for ${brandId}:`, err);
    });
  });
}
