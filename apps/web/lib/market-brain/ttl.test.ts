import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { SCRAPE_CACHE_TTL_DAYS, sweepExpiredScrapeCache } from "./scrape-cache";

type Captured = { table?: string; column?: string; value?: string };

// Minimal chainable fake matching .from(t).delete().lt(col, val).select("id").
function makeMockSupabase(
  result: { data: { id: string }[] | null; error: { message: string } | null },
  captured: Captured,
): SupabaseClient<Database> {
  const builder = {
    delete: mock(() => builder),
    lt: mock((column: string, value: string) => {
      captured.column = column;
      captured.value = value;
      return builder;
    }),
    select: mock(async () => result),
  };
  const from = mock((table: string) => {
    captured.table = table;
    return builder;
  });
  return { from } as unknown as SupabaseClient<Database>;
}

describe("market_scrape_cache TTL sweep (T5)", () => {
  const NOW = new Date("2026-06-01T00:00:00.000Z");

  test("TTL is 7 days", () => {
    expect(SCRAPE_CACHE_TTL_DAYS).toBe(7);
  });

  test("deletes rows past expiry on market_scrape_cache, keyed on expires_at < now", async () => {
    const captured: Captured = {};
    const supabase = makeMockSupabase(
      { data: [{ id: "a" }, { id: "b" }], error: null },
      captured,
    );

    const res = await sweepExpiredScrapeCache(supabase, NOW);

    expect(res.deleted).toBe(2);
    expect(captured.table).toBe("market_scrape_cache");
    expect(captured.column).toBe("expires_at");
    expect(captured.value).toBe(NOW.toISOString());
  });

  test("nothing expired → zero deleted", async () => {
    const res = await sweepExpiredScrapeCache(
      makeMockSupabase({ data: [], error: null }, {}),
      NOW,
    );
    expect(res.deleted).toBe(0);
  });

  test("throws on db error rather than silently swallowing", async () => {
    const supabase = makeMockSupabase(
      { data: null, error: { message: "boom" } },
      {},
    );
    await expect(sweepExpiredScrapeCache(supabase, NOW)).rejects.toThrow(
      /market_scrape_cache sweep failed/,
    );
  });
});
