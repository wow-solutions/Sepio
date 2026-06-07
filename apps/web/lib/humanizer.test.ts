import { describe, expect, test } from "bun:test";
import { stripEmDashes } from "./humanizer";

describe("stripEmDashes — em dash (the AI tell) becomes a comma", () => {
  test("tight em dash → comma", () => {
    expect(stripEmDashes("It works—usually.")).toBe("It works, usually.");
  });

  test("spaced em dash → comma, no doubled space", () => {
    expect(stripEmDashes("It works — usually.")).toBe("It works, usually.");
  });

  test("multiple em dashes in one string", () => {
    expect(stripEmDashes("a—b—c")).toBe("a, b, c");
  });
});

describe("stripEmDashes — boundary cleanup (adversarial F1/F2/F3)", () => {
  test("em dash at string start → no leading comma", () => {
    expect(stripEmDashes("—really?")).toBe("really?");
  });

  test("em dash at string end → no trailing comma", () => {
    expect(stripEmDashes("wait—")).toBe("wait");
  });

  test("em dash before a period → no comma-before-punctuation", () => {
    expect(stripEmDashes("Wait—.")).toBe("Wait.");
  });

  test("consecutive em dashes → single comma", () => {
    expect(stripEmDashes("a——b")).toBe("a, b");
  });

  test("em dash at end of a line → line wraps cleanly", () => {
    expect(stripEmDashes("line one—\nline two")).toBe("line one\nline two");
  });

  test("em dash alone on its own line → no stray comma line", () => {
    expect(stripEmDashes("a\n—\nb")).toBe("a\n\nb");
  });
});

describe("stripEmDashes — numeric ranges preserved", () => {
  test("em dash between digits → normalized to en dash range", () => {
    expect(stripEmDashes("16—20%")).toBe("16–20%");
  });

  test("spaced em dash between digits → en dash range", () => {
    expect(stripEmDashes("16 — 20%")).toBe("16–20%");
  });

  test("en dash percentage range untouched", () => {
    expect(stripEmDashes("only 24% saw 16–20% improvement")).toBe(
      "only 24% saw 16–20% improvement",
    );
  });

  test("en dash year range untouched", () => {
    expect(stripEmDashes("over 2024–2026 the trend held")).toBe(
      "over 2024–2026 the trend held",
    );
  });

  test("en dash day range untouched", () => {
    expect(stripEmDashes("ships in 3–5 days")).toBe("ships in 3–5 days");
  });
});

describe("stripEmDashes — en dash left to the model (adversarial F5)", () => {
  test("label range Q1–Q2 not mangled into a list", () => {
    expect(stripEmDashes("revenue fell Q1–Q2")).toBe("revenue fell Q1–Q2");
  });

  test("month range Jan–Mar preserved", () => {
    expect(stripEmDashes("hiring froze Jan–Mar")).toBe("hiring froze Jan–Mar");
  });

  test("minus sign not turned into a comma (no sign flip)", () => {
    expect(stripEmDashes("it dropped to –5 overnight")).toBe(
      "it dropped to –5 overnight",
    );
  });

  test("en dash used as a sentence break is left for the prompt", () => {
    expect(stripEmDashes("self-select – they had budget")).toBe(
      "self-select – they had budget",
    );
  });
});

describe("stripEmDashes — leaves unrelated text alone", () => {
  test("plain hyphen untouched", () => {
    expect(stripEmDashes("self-selected winners")).toBe("self-selected winners");
  });

  test("markdown horizontal rule (three hyphens) untouched", () => {
    expect(stripEmDashes("intro\n\n---\n\nbody")).toBe("intro\n\n---\n\nbody");
  });

  test("text with no dashes unchanged", () => {
    expect(stripEmDashes("Plain sentence, nothing fancy.")).toBe(
      "Plain sentence, nothing fancy.",
    );
  });
});
