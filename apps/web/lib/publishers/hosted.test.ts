import { describe, expect, test } from "bun:test";
import { hostedAdapter } from "./hosted";
import type { PublishContext, PublishablePost } from "./types";

// These guard paths (empty title / empty body) return BEFORE any DB write, so
// they need no service-role client or network — pure input-validation coverage.
function makeCtx(post: Partial<PublishablePost>): PublishContext {
  const base: PublishablePost = {
    id: "00000000-0000-0000-0000-000000000001",
    brand_id: "b1",
    platform: "hosted",
    language: "en",
    title: "A title",
    slug: null,
    excerpt: null,
    content_text: "Body text",
    content_markdown: null,
    cover_image_url: null,
    cover_image_alt: null,
  };
  return { post: { ...base, ...post }, brandId: "b1", config: {} };
}

describe("hostedAdapter — input guards", () => {
  test("null title → 400", async () => {
    const out = await hostedAdapter.publish(makeCtx({ title: null }));
    expect(out).toEqual({ ok: false, status: 400, message: "Article title required for blog publish" });
  });

  test("whitespace-only title → 400", async () => {
    const out = await hostedAdapter.publish(makeCtx({ title: "   " }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  test("empty body (both null) → 400 (R-11)", async () => {
    const out = await hostedAdapter.publish(
      makeCtx({ title: "Real title", content_text: null, content_markdown: null }),
    );
    expect(out).toEqual({ ok: false, status: 400, message: "Article body is empty" });
  });

  test("whitespace-only body → 400 (R-11)", async () => {
    const out = await hostedAdapter.publish(
      makeCtx({ title: "Real title", content_text: "   \n  ", content_markdown: null }),
    );
    expect(out).toEqual({ ok: false, status: 400, message: "Article body is empty" });
  });
});
