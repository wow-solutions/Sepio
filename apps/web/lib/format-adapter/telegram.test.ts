import { describe, expect, test } from "bun:test";
import { telegramAdapter } from "./telegram";

const adapt = (text: string, extra = {}) => telegramAdapter.adapt({ text, ...extra });

describe("telegramAdapter", () => {
  test("bolds the first non-empty line as a headline", () => {
    const out = adapt("Headline\nbody line");
    expect(out.text.startsWith("<b>Headline</b>")).toBe(true);
    expect(out.parseMode).toBe("HTML");
  });

  test("HTML-escapes special characters", () => {
    const out = adapt("first\na < b & c > d");
    expect(out.text).toContain("a &lt; b &amp; c &gt; d");
  });

  test("disables link preview for a text-only post, enables for image-led", () => {
    expect(adapt("hi").disableWebPagePreview).toBe(true);
    expect(adapt("hi", { imageUrl: "https://img/x.png" }).disableWebPagePreview).toBe(false);
  });

  test("uses caption limit (1024) when an image is present and truncates overflow", () => {
    const long = "x".repeat(1500);
    const out = adapt(long, { imageUrl: "https://img/x.png" });
    expect(out.asCaption).toBe(true);
    // visible length (pre-escape, minus the <b></b> wrapper) stays within the caption limit
    expect(out.text.replace(/<\/?b>/g, "").length).toBeLessThanOrEqual(1024);
    expect(out.warnings.some((w) => w.includes("truncated"))).toBe(true);
  });

  test("allows up to 4096 for a standalone message", () => {
    const out = adapt("y".repeat(4096));
    expect(out.asCaption).toBe(false);
    expect(out.warnings.some((w) => w.includes("truncated"))).toBe(false);
  });

  test("caps hashtags to 3", () => {
    const out = adapt("first line", { hashtags: ["a", "b", "c", "d"] });
    expect(out.text).toContain("#a #b #c");
    expect(out.text).not.toContain("#d");
  });
});
