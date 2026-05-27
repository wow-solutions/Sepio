import { describe, expect, test } from "bun:test";
import { blogAdapter } from "./blog";

const adapt = (text: string, extra = {}) => blogAdapter.adapt({ text, ...extra });

describe("blogAdapter", () => {
  test("adds an H1 from the first line when missing", () => {
    const out = adapt("My first heading\n\nSome body text.");
    expect(out.bodyMarkdown.startsWith("# My first heading")).toBe(true);
    expect(out.warnings.some((w) => w.includes("H1"))).toBe(true);
  });

  test("keeps an existing H1 without doubling it", () => {
    const out = adapt("# Real Title\n\nbody");
    expect(out.bodyMarkdown).toBe("# Real Title\n\nbody");
    expect(out.title).toBe("Real Title");
    expect((out.bodyMarkdown.match(/^# /gm) ?? []).length).toBe(1);
  });

  test("shortens an over-long title to 60 chars and warns", () => {
    const long = "A".repeat(80);
    const out = adapt(`${long}\n\nbody`);
    expect(out.title.length).toBeLessThanOrEqual(60);
    expect(out.warnings.some((w) => w.includes("Title"))).toBe(true);
  });

  test("meta description stays within 160 chars", () => {
    const out = adapt(`Title\n\n${"word ".repeat(80)}`);
    expect(out.metaDescription.length).toBeLessThanOrEqual(160);
  });

  test("warns when there are no subheadings", () => {
    const out = adapt("Title\n\nflat body, no h2");
    expect(out.warnings.some((w) => w.includes("subheadings"))).toBe(true);
  });
});
