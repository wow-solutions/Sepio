// Unit tests for the variant fan-out route's pure pieces: the cache-freshness
// decision (isVariantFresh) and the request zod schema. Full route integration
// (auth, DB, Claude) is deferred to /qa — same precedent as the generate route.

import { describe, expect, test } from "bun:test";
import { isVariantFresh, RequestSchema } from "./route";

describe("isVariantFresh", () => {
  const fresh = (state: string, version = 1) => ({
    variant_state: state,
    generated_from_source_version: version,
  });

  test("synced child at current version → fresh", () => {
    expect(isVariantFresh(fresh("synced"), 1)).toBe(true);
  });

  test("edited child at current version → fresh", () => {
    expect(isVariantFresh(fresh("edited"), 1)).toBe(true);
  });

  test("published child at current version → fresh", () => {
    expect(isVariantFresh(fresh("published"), 1)).toBe(true);
  });

  test("stale-state child → not fresh (regenerate)", () => {
    expect(isVariantFresh(fresh("stale"), 1)).toBe(false);
  });

  test("'source' state is never a returnable variant", () => {
    expect(isVariantFresh(fresh("source"), 1)).toBe(false);
  });

  test("older source_version → not fresh even if synced", () => {
    expect(isVariantFresh(fresh("synced", 1), 2)).toBe(false);
  });

  test("force=true overrides a fresh child", () => {
    expect(isVariantFresh(fresh("synced"), 1, true)).toBe(false);
  });

  test("force=false leaves a fresh child returnable", () => {
    expect(isVariantFresh(fresh("synced"), 1, false)).toBe(true);
  });

  test("missing child (null) → not fresh", () => {
    expect(isVariantFresh(null, 1)).toBe(false);
  });

  test("undefined child → not fresh", () => {
    expect(isVariantFresh(undefined, 1)).toBe(false);
  });

  test("null generated_from_source_version → not fresh", () => {
    expect(
      isVariantFresh({ variant_state: "synced", generated_from_source_version: null }, 1),
    ).toBe(false);
  });
});

describe("variants RequestSchema", () => {
  test("accepts a valid channel platform", () => {
    const r = RequestSchema.safeParse({ platform: "linkedin" });
    expect(r.success).toBe(true);
  });

  test("accepts platform + force", () => {
    const r = RequestSchema.safeParse({ platform: "x", force: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.force).toBe(true);
  });

  test("rejects 'hosted' (the blog is the source, not a variant)", () => {
    const r = RequestSchema.safeParse({ platform: "hosted" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "the blog is the source, not a variant",
      );
    }
  });

  test("rejects an unknown platform", () => {
    const r = RequestSchema.safeParse({ platform: "mastodon" });
    expect(r.success).toBe(false);
  });

  test("rejects a missing platform", () => {
    const r = RequestSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  test("rejects a non-boolean force", () => {
    const r = RequestSchema.safeParse({ platform: "telegram", force: "yes" });
    expect(r.success).toBe(false);
  });

  test("accepts each non-hosted channel", () => {
    for (const p of [
      "linkedin",
      "telegram",
      "instagram",
      "tiktok",
      "threads",
      "x",
      "facebook",
    ]) {
      expect(RequestSchema.safeParse({ platform: p }).success).toBe(true);
    }
  });
});
