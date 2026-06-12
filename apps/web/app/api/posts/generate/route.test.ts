// Lane E test: validate request schema accepts all 3 input modes correctly.
// Full route handler integration testing deferred to /qa skill — backend logic
// is verified via SQL smoke tests (Lane A для insert_post_and_mark_candidate RPC,
// Lane E для increment_topic_impressions RPC + ownership protection).
//
// CRITICAL: regression coverage on existing topic_hint-only path — Lane A
// smoke test already confirmed RPC handles p_candidate_id=null correctly
// (backwards-compat insert via direct path here in route.ts).

import { describe, expect, test } from "bun:test";
import { z } from "zod";

// Extracted схема из route.ts (kept in sync manually — if schema changes,
// update both). Pure function test — no HTTP needed.
const RequestSchema = z.object({
  brand_id: z.string().uuid(),
  format: z.enum(["linkedin_post", "blog"]).default("linkedin_post"),
  topic_hint: z.string().max(500).optional(),
  source_text: z.string().min(50).max(30_000).optional(),
  topic_candidate_id: z.string().uuid().optional(),
});

// Canonical v4 UUID example (passes Zod v4 strict uuid validation)
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("/api/posts/generate RequestSchema", () => {
  test("accepts brand_id only (Claude picks topic itself — legacy fallback)", () => {
    const result = RequestSchema.safeParse({ brand_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  test("accepts brand_id + topic_hint (legacy free-text mode)", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      topic_hint: "Write about AC repair",
    });
    expect(result.success).toBe(true);
  });

  test("accepts brand_id + source_text (article adaptation mode)", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      source_text:
        "This is a much longer article that should be adapted into a LinkedIn-style post. " +
        "It needs to be at least 50 characters to pass validation.",
    });
    expect(result.success).toBe(true);
  });

  test("accepts brand_id + topic_candidate_id (NEW Lane E mode)", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      topic_candidate_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid brand_id (not UUID)", () => {
    const result = RequestSchema.safeParse({ brand_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid topic_candidate_id (not UUID)", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      topic_candidate_id: "garbage",
    });
    expect(result.success).toBe(false);
  });

  test("rejects topic_hint over 500 chars", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      topic_hint: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test("rejects source_text under 50 chars", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      source_text: "too short",
    });
    expect(result.success).toBe(false);
  });

  test("rejects source_text over 30k chars", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      source_text: "a".repeat(30_001),
    });
    expect(result.success).toBe(false);
  });

  test("allows all three optional fields together (route logic chooses precedence)", () => {
    // Route precedence: candidate_id > source_text > topic_hint (per route.ts comment).
    // Schema just validates shape — precedence resolution is route-level.
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      topic_hint: "free text",
      source_text:
        "long article text that meets the 50 character minimum requirement here.",
      topic_candidate_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("format defaults to linkedin_post when omitted (back-compat)", () => {
    const result = RequestSchema.safeParse({ brand_id: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe("linkedin_post");
  });

  test("accepts format: blog", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      format: "blog",
      topic_hint: "humidity control for data centers",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe("blog");
  });

  test("rejects an unknown format", () => {
    const result = RequestSchema.safeParse({
      brand_id: VALID_UUID,
      format: "tiktok",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty body (no brand_id)", () => {
    const result = RequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects null brand_id", () => {
    const result = RequestSchema.safeParse({ brand_id: null });
    expect(result.success).toBe(false);
  });
});
