import { describe, expect, test } from "bun:test";
import { extractHeroImage, splitFeatured } from "./blog-render";

describe("extractHeroImage", () => {
  test("cover present: heroUrl = cover, body unchanged", () => {
    const post = {
      cover_image_url: "https://cdn/cover.png",
      body: "First para.\n\n![alt](https://cdn/inbody.png)\n\nSecond para.",
    };
    const out = extractHeroImage(post);
    expect(out.heroUrl).toBe("https://cdn/cover.png");
    expect(out.body).toBe(post.body);
  });

  test("cover empty + image in body: url extracted, image stripped, rest intact", () => {
    const post = {
      cover_image_url: "",
      body: "Intro line.\n\n![hero alt](https://cdn/hero.png)\n\nClosing line.",
    };
    const out = extractHeroImage(post);
    expect(out.heroUrl).toBe("https://cdn/hero.png");
    expect(out.body).not.toContain("![hero alt]");
    expect(out.body).toContain("Intro line.");
    expect(out.body).toContain("Closing line.");
    // The now-empty image line is gone; surrounding text preserved.
    expect(out.body).toBe("Intro line.\n\nClosing line.");
  });

  test("image with a title: src excludes the title, whole token stripped (Codex)", () => {
    const post = {
      cover_image_url: null,
      body: 'Intro.\n\n![alt](https://cdn/hero.png "A Title")\n\nOutro.',
    };
    const out = extractHeroImage(post);
    expect(out.heroUrl).toBe("https://cdn/hero.png"); // no title in the src
    expect(out.body).toBe("Intro.\n\nOutro."); // full image token removed
  });

  test("cover null + no image in body: heroUrl null, body unchanged", () => {
    const post = {
      cover_image_url: null,
      body: "Just prose, no images here.",
    };
    const out = extractHeroImage(post);
    expect(out.heroUrl).toBeNull();
    expect(out.body).toBe(post.body);
  });

  test("multiple body images: only the first is stripped", () => {
    const post = {
      cover_image_url: null,
      body: "A\n\n![one](https://cdn/1.png)\n\nB\n\n![two](https://cdn/2.png)\n\nC",
    };
    const out = extractHeroImage(post);
    expect(out.heroUrl).toBe("https://cdn/1.png");
    expect(out.body).not.toContain("![one]");
    expect(out.body).toContain("![two](https://cdn/2.png)");
    expect(out.body).toBe("A\n\nB\n\n![two](https://cdn/2.png)\n\nC");
  });
});

describe("splitFeatured", () => {
  test("empty array: featured null, rest empty", () => {
    const out = splitFeatured<number>([]);
    expect(out.featured).toBeNull();
    expect(out.rest).toEqual([]);
  });

  test("one post: featured = that post, rest empty", () => {
    const out = splitFeatured([{ slug: "a" }]);
    expect(out.featured).toEqual({ slug: "a" });
    expect(out.rest).toEqual([]);
  });

  test("three posts: featured = first, rest = remaining two in order", () => {
    const out = splitFeatured([{ slug: "a" }, { slug: "b" }, { slug: "c" }]);
    expect(out.featured).toEqual({ slug: "a" });
    expect(out.rest).toEqual([{ slug: "b" }, { slug: "c" }]);
  });
});
