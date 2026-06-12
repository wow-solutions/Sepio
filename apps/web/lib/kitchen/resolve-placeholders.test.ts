import { describe, expect, test } from "bun:test";
import {
  pickPrimaryUrl,
  applyPrimaryUrl,
  hostedFirstGuard,
  resolveBody,
  type Variant,
} from "./resolve-placeholders";

const ORIGIN = "https://app.sepio.dev";

function v(
  platform: string,
  status: string,
  external_post_url: string | null,
): Variant {
  return { platform, status, external_post_url };
}

describe("pickPrimaryUrl", () => {
  test("ranks hosted over linkedin over tiktok", () => {
    const variants = [
      v("tiktok", "published", "https://tiktok.com/@x/video/3"),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
      v("hosted", "published", "/es/p/brand/slug"),
    ];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe(`${ORIGIN}/es/p/brand/slug`);
  });

  test("picks linkedin when hosted absent", () => {
    const variants = [
      v("tiktok", "published", "https://tiktok.com/@x/video/3"),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
    ];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe("https://linkedin.com/posts/2");
  });

  test("ignores unpublished variants", () => {
    const variants = [
      v("hosted", "draft", "/es/p/brand/slug"),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
    ];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe("https://linkedin.com/posts/2");
  });

  test("ignores published variants without a url", () => {
    const variants = [
      v("hosted", "published", null),
      v("hosted", "published", ""),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
    ];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe("https://linkedin.com/posts/2");
  });

  test("returns null when nothing qualifies", () => {
    expect(pickPrimaryUrl([], ORIGIN)).toBeNull();
    expect(
      pickPrimaryUrl([v("hosted", "draft", "/es/p/brand/slug")], ORIGIN),
    ).toBeNull();
  });

  test("relative hosted url → absolute, trailing slash on origin stripped", () => {
    const variants = [v("hosted", "published", "/es/p/brand/slug")];
    expect(pickPrimaryUrl(variants, "https://app.sepio.dev/")).toBe(
      "https://app.sepio.dev/es/p/brand/slug",
    );
  });

  test("absolute url passes through unchanged", () => {
    const variants = [v("linkedin", "published", "https://linkedin.com/posts/2")];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe("https://linkedin.com/posts/2");
  });

  test("unknown platform ranks last", () => {
    const variants = [
      v("mystery", "published", "https://mystery.example/1"),
      v("telegram", "published", "https://t.me/c/2"),
    ];
    expect(pickPrimaryUrl(variants, ORIGIN)).toBe("https://t.me/c/2");
  });
});

describe("applyPrimaryUrl", () => {
  test("replaces a single token", () => {
    expect(applyPrimaryUrl("Read more: {{PRIMARY_URL}}", "https://x.test/a")).toBe(
      "Read more: https://x.test/a",
    );
  });

  test("replaces multiple tokens", () => {
    expect(
      applyPrimaryUrl("{{PRIMARY_URL}} and {{PRIMARY_URL}}", "https://x.test/a"),
    ).toBe("https://x.test/a and https://x.test/a");
  });

  test("null url: strips empty markdown link to its text", () => {
    expect(applyPrimaryUrl("See the [full article]({{PRIMARY_URL}}).", null)).toBe(
      "See the full article.",
    );
  });

  test("null url: removes orphaned empty parens", () => {
    expect(applyPrimaryUrl("Details ({{PRIMARY_URL}}) here", null)).toBe(
      "Details here",
    );
  });

  test("null url: bare token removed, doubled spaces collapsed", () => {
    expect(applyPrimaryUrl("Link {{PRIMARY_URL}} done", null)).toBe("Link done");
  });

  test("null url: no token leaves body untouched", () => {
    expect(applyPrimaryUrl("Nothing to replace.", null)).toBe("Nothing to replace.");
  });
});

describe("hostedFirstGuard", () => {
  test("hosted target is always ok", () => {
    expect(hostedFirstGuard("hosted", [])).toEqual({ ok: true });
  });

  test("blocks social when no hosted variant is published with a url", () => {
    const variants = [
      v("hosted", "draft", "/es/p/brand/slug"),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
    ];
    expect(hostedFirstGuard("linkedin", variants)).toEqual({
      ok: false,
      reason: "Publish the blog first so links point to it",
    });
  });

  test("allows social once hosted is published with a url", () => {
    const variants = [v("hosted", "published", "/es/p/brand/slug")];
    expect(hostedFirstGuard("linkedin", variants)).toEqual({ ok: true });
  });
});

describe("resolveBody", () => {
  test("resolves the body against the fullest published destination", () => {
    const variants = [
      v("hosted", "published", "/es/p/brand/slug"),
      v("linkedin", "published", "https://linkedin.com/posts/2"),
    ];
    expect(
      resolveBody("Full piece: {{PRIMARY_URL}}", "x", variants, ORIGIN),
    ).toBe(`Full piece: ${ORIGIN}/es/p/brand/slug`);
  });

  test("gracefully strips when nothing is published (no guard enforced)", () => {
    expect(
      resolveBody("See the [full article]({{PRIMARY_URL}}).", "x", [], ORIGIN),
    ).toBe("See the full article.");
  });
});
