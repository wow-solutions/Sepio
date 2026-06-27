import { describe, expect, test } from "bun:test";
import {
  pickPrimaryUrl,
  pickBlogUrl,
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

describe("pickBlogUrl", () => {
  test("returns the published hosted url (absolute)", () => {
    const variants = [
      v("linkedin", "published", "https://linkedin.com/posts/2"),
      v("hosted", "published", "/es/p/brand/slug"),
    ];
    expect(pickBlogUrl(variants, ORIGIN)).toBe(`${ORIGIN}/es/p/brand/slug`);
  });

  test("returns an absolute hosted (own-domain) url unchanged", () => {
    const variants = [v("hosted", "published", "https://blog.client.com/slug")];
    expect(pickBlogUrl(variants, ORIGIN)).toBe("https://blog.client.com/slug");
  });

  // The regression that motivated pickBlogUrl: with no blog published, the
  // cross-link must be NULL (→ stripped), never another social channel's URL.
  test("returns null when only social channels are published (NOT the linkedin url)", () => {
    const variants = [
      v("linkedin", "published", "https://linkedin.com/posts/2"),
      v("x", "published", "https://x.com/i/3"),
    ];
    expect(pickBlogUrl(variants, ORIGIN)).toBeNull();
  });

  test("ignores an unpublished hosted variant", () => {
    expect(
      pickBlogUrl([v("hosted", "draft", "/es/p/brand/slug")], ORIGIN),
    ).toBeNull();
  });

  test("returns null for an empty variant set", () => {
    expect(pickBlogUrl([], ORIGIN)).toBeNull();
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

  test("null url: drops a dangling invite that directly precedes the token", () => {
    expect(applyPrimaryUrl("Read the full article: {{PRIMARY_URL}}", null)).toBe("");
  });

  test("null url: drops the invite line, keeps the rest, trims edges", () => {
    expect(
      applyPrimaryUrl("Great breakdown of the costs.\n\nRead more: {{PRIMARY_URL}}", null),
    ).toBe("Great breakdown of the costs.");
  });

  test("null url: leaves an unrelated 'details' word alone when not before the token", () => {
    expect(applyPrimaryUrl("More details inside. {{PRIMARY_URL}}", null)).toBe(
      "More details inside.",
    );
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
