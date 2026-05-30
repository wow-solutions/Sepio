import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

// Hard TTL for raw competitor scrape extracts. The DB default sets expires_at =
// fetched_at + 7d on first insert; the re-scrape upsert (T6/T8) must refresh both
// fetched_at and expires_at using this same constant so a re-fetch resets the TTL.
export const SCRAPE_CACHE_TTL_DAYS = 7;

// Delete cache rows whose TTL has lapsed. Mirrors the topic_candidates cleanup
// pattern — a service-role DELETE WHERE expires_at < now() — run by the Market
// Brain cron before each research pass (T8). Caller supplies the service-role
// client; market_scrape_cache has no user RLS, so user clients see nothing.
// `now` is injectable for deterministic tests. Returns the number of rows removed.
export async function sweepExpiredScrapeCache(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<{ deleted: number }> {
  const { data, error } = await supabase
    .from("market_scrape_cache")
    .delete()
    .lt("expires_at", now.toISOString())
    .select("id");

  if (error) {
    throw new Error(`market_scrape_cache sweep failed: ${error.message}`);
  }

  return { deleted: data?.length ?? 0 };
}
