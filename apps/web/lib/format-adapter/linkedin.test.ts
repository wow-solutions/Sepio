import { describe, expect, test } from "bun:test";
import { linkedinAdapter } from "./linkedin";
import { toUnicodeBold } from "./text-utils";

const adapt = (text: string, extra = {}) => linkedinAdapter.adapt({ text, ...extra });

describe("linkedinAdapter", () => {
  test("converts markdown bold to unicode bold", () => {
    const out = adapt("This is **important** news");
    expect(out.text).toContain(toUnicodeBold("important"));
    expect(out.text).not.toContain("**");
  });

  test("moves CTA url to first comment, keeps body link-free", () => {
    const out = adapt("Great body text here", { ctaUrl: "https://sepio.app/x" });
    expect(out.firstComment).toBe("https://sepio.app/x");
    expect(out.text).not.toContain("http");
  });

  test("strips an in-body link into the first comment and warns", () => {
    const out = adapt("Check this https://example.com/post out");
    expect(out.text).not.toContain("http");
    expect(out.firstComment).toBe("https://example.com/post");
    expect(out.warnings.some((w) => w.includes("link"))).toBe(true);
  });

  test("caps hashtags to 3, appends at end, and warns", () => {
    const out = adapt("Body", { hashtags: ["a", "b", "c", "d", "e"] });
    expect(out.text.endsWith("#a #b #c")).toBe(true);
    expect(out.warnings.some((w) => w.includes("hashtags"))).toBe(true);
  });

  test("warns when more than 2 emoji", () => {
    const out = adapt("🚀 🔥 💡 launch");
    expect(out.warnings.some((w) => w.includes("emoji"))).toBe(true);
  });

  test("passes image through", () => {
    const out = adapt("Body", { imageUrl: "https://img/x.png" });
    expect(out.imageUrl).toBe("https://img/x.png");
  });

  test("warns on a short post", () => {
    const out = adapt("tiny");
    expect(out.warnings.some((w) => w.includes("short"))).toBe(true);
  });
});
