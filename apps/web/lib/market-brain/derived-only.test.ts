import { describe, expect, test } from "bun:test";
import {
  DifferentiationSchema,
  RawTextLeakError,
  assertNoRawCompetitorText,
  type Differentiation,
} from "./derived-only";

describe("DifferentiationSchema (shape rejects free-text)", () => {
  test("rejects a plain string (free-text)", () => {
    expect(DifferentiationSchema.safeParse("some free-text differentiation").success).toBe(false);
  });

  test("rejects missing arrays", () => {
    expect(DifferentiationSchema.safeParse({ common_themes: [] }).success).toBe(false);
  });

  test("rejects prevalence_count < 1 and non-integer", () => {
    const bad = { common_themes: [{ theme: "x", prevalence_count: 0 }], positioning_gaps: [] };
    expect(DifferentiationSchema.safeParse(bad).success).toBe(false);
    const frac = { common_themes: [{ theme: "x", prevalence_count: 1.5 }], positioning_gaps: [] };
    expect(DifferentiationSchema.safeParse(frac).success).toBe(false);
  });

  test("accepts a well-formed object", () => {
    const ok = {
      common_themes: [{ theme: "24/7 availability", prevalence_count: 2 }],
      positioning_gaps: [{ angle: "transparent pricing", rationale: "none publish prices" }],
    };
    expect(DifferentiationSchema.safeParse(ok).success).toBe(true);
  });
});

describe("assertNoRawCompetitorText", () => {
  const corpus = [
    "We provide certified nitrogen pressure testing up to 42 bar for leak detection.",
    "Same-day air conditioning repair across the metro area.",
  ];

  const diff = (over: Partial<Differentiation>): Differentiation => ({
    common_themes: over.common_themes ?? [],
    positioning_gaps: over.positioning_gaps ?? [],
  });

  test("throws when a theme reproduces a long verbatim run of the corpus", () => {
    const leaked = diff({
      common_themes: [
        { theme: "certified nitrogen pressure testing up to 42 bar", prevalence_count: 1 },
      ],
    });
    expect(() => assertNoRawCompetitorText(leaked, corpus)).toThrow(RawTextLeakError);
  });

  test("throws when a gap rationale lifts corpus text", () => {
    const leaked = diff({
      positioning_gaps: [
        { angle: "speed", rationale: "Same-day air conditioning repair across the metro area." },
      ],
    });
    expect(() => assertNoRawCompetitorText(leaked, corpus)).toThrow(RawTextLeakError);
  });

  test("passes for paraphrased, derived fields", () => {
    const clean = diff({
      common_themes: [{ theme: "Fast turnaround on repairs", prevalence_count: 2 }],
      positioning_gaps: [
        { angle: "Pressure-test rigor", rationale: "Rivals skip deep leak verification." },
      ],
    });
    expect(() => assertNoRawCompetitorText(clean, corpus)).not.toThrow();
  });

  test("short shared industry terms do not trip the guard", () => {
    const clean = diff({ common_themes: [{ theme: "AC repair", prevalence_count: 2 }] });
    expect(() => assertNoRawCompetitorText(clean, corpus)).not.toThrow();
  });

  test("empty corpus never throws", () => {
    const d = diff({ common_themes: [{ theme: "whatever long string here is fine", prevalence_count: 1 }] });
    expect(() => assertNoRawCompetitorText(d, [])).not.toThrow();
  });
});
