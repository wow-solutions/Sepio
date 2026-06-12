import { describe, expect, test } from "bun:test";
import { getPostBody, bodyUpdateForPlatform, maxBodyChars } from "./post-body";

describe("getPostBody", () => {
  test("hosted → content_markdown (the canonical blog column)", () => {
    expect(
      getPostBody({
        platform: "hosted",
        content_markdown: "# Article",
        content_text: "stale short text",
      }),
    ).toBe("# Article");
  });

  test("linkedin → content_text", () => {
    expect(
      getPostBody({
        platform: "linkedin",
        content_markdown: null,
        content_text: "A LinkedIn post.",
      }),
    ).toBe("A LinkedIn post.");
  });

  test("null body → empty string (never undefined)", () => {
    expect(
      getPostBody({ platform: "hosted", content_markdown: null, content_text: null }),
    ).toBe("");
    expect(
      getPostBody({ platform: "linkedin", content_markdown: null, content_text: null }),
    ).toBe("");
  });
});

describe("bodyUpdateForPlatform", () => {
  test("hosted writes content_markdown, never content_text", () => {
    const patch = bodyUpdateForPlatform("hosted", "# Body");
    expect(patch).toEqual({ content_markdown: "# Body" });
    expect("content_text" in patch).toBe(false);
  });

  test("linkedin writes content_text", () => {
    expect(bodyUpdateForPlatform("linkedin", "post")).toEqual({
      content_text: "post",
    });
  });
});

describe("maxBodyChars", () => {
  test("hosted gets long-form headroom, social stays bounded", () => {
    expect(maxBodyChars("hosted")).toBe(50_000);
    expect(maxBodyChars("linkedin")).toBe(10_000);
    expect(maxBodyChars("hosted")).toBeGreaterThan(maxBodyChars("linkedin"));
  });
});
