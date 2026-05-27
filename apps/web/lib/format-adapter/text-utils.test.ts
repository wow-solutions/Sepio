import { describe, expect, test } from "bun:test";
import {
  countEmoji,
  extractUrls,
  firstLine,
  formatHashtags,
  htmlEscape,
  markdownToPlain,
  normalizeWhitespace,
  stripUrls,
  toUnicodeBold,
  truncate,
} from "./text-utils";

describe("toUnicodeBold", () => {
  test("maps ASCII letters and digits to sans-serif bold", () => {
    expect(toUnicodeBold("Ab9")).toBe("𝗔𝗯𝟵");
  });
  test("passes non-ASCII through unchanged (only ASCII letters/digits bold)", () => {
    expect(toUnicodeBold("Привет, мир")).toBe("Привет, мир");
    // mixed scripts: ASCII letters bold, non-ASCII stays — documented limitation
    expect(toUnicodeBold("café")).toBe("𝗰𝗮𝗳é");
  });
});

describe("countEmoji", () => {
  test("counts pictographic emoji", () => {
    expect(countEmoji("hi 👍 there 🚀")).toBe(2);
  });
  test("zero for plain text", () => {
    expect(countEmoji("no emoji here")).toBe(0);
  });
});

describe("htmlEscape", () => {
  test("escapes &, <, >", () => {
    expect(htmlEscape("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("normalizeWhitespace", () => {
  test("collapses 3+ blank lines and trims", () => {
    expect(normalizeWhitespace("a\n\n\n\nb  \n")).toBe("a\n\nb");
  });
});

describe("extractUrls / stripUrls", () => {
  test("finds and removes http(s) urls", () => {
    const t = "see https://example.com/x now";
    expect(extractUrls(t)).toEqual(["https://example.com/x"]);
    expect(stripUrls(t)).toBe("see now");
  });
});

describe("markdownToPlain", () => {
  test("bold becomes unicode bold", () => {
    expect(markdownToPlain("a **big** deal")).toBe(`a ${toUnicodeBold("big")} deal`);
  });
  test("link flattens to its text and heading marker drops", () => {
    expect(markdownToPlain("# Title\n[click](https://x.io)")).toBe("Title\nclick");
  });
});

describe("formatHashtags", () => {
  test("normalizes, caps, and prefixes", () => {
    expect(formatHashtags(["#a", "b ", "", "c", "d"], 3)).toBe("#a #b #c");
  });
  test("empty for no tags", () => {
    expect(formatHashtags(undefined, 3)).toBe("");
  });
});

describe("firstLine", () => {
  test("first non-empty trimmed line", () => {
    expect(firstLine("\n  \n  Hook here \nrest")).toBe("Hook here");
  });
});

describe("truncate", () => {
  test("no-op under limit", () => {
    expect(truncate("short", 100)).toBe("short");
  });
  test("cuts on a word boundary with ellipsis", () => {
    const out = truncate("one two three four five", 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith("…")).toBe(true);
  });
});
