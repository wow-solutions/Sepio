import { describe, expect, test } from "bun:test";
import {
  renderDifferentiationBlock,
  differentiationContextBlocks,
} from "./differentiation-context";

const OK_ROW = {
  common_themes: [
    { theme: "24/7 emergency service", prevalence_count: 3 },
    { theme: "Free quotes", prevalence_count: 2 },
  ],
  positioning_gaps: [
    {
      angle: "Humidity-specific maintenance",
      rationale: "No competitor speaks to Panama's coastal humidity wear.",
    },
  ],
};

describe("renderDifferentiationBlock — skip cases (low confidence / invalid)", () => {
  test("null row → empty string", () => {
    expect(renderDifferentiationBlock(null)).toBe("");
  });

  test("undefined row → empty string", () => {
    expect(renderDifferentiationBlock(undefined)).toBe("");
  });

  test("both arrays empty (low confidence) → empty string", () => {
    expect(
      renderDifferentiationBlock({ common_themes: [], positioning_gaps: [] }),
    ).toBe("");
  });

  test("invalid jsonb shape (theme missing prevalence_count) → empty string", () => {
    expect(
      renderDifferentiationBlock({
        common_themes: [{ theme: "no count" }],
        positioning_gaps: [],
      }),
    ).toBe("");
  });

  test("garbage jsonb (string instead of array) → empty string", () => {
    expect(
      renderDifferentiationBlock({
        common_themes: "not an array",
        positioning_gaps: null,
      }),
    ).toBe("");
  });

  test("gap missing rationale → invalid → empty string", () => {
    expect(
      renderDifferentiationBlock({
        common_themes: [],
        positioning_gaps: [{ angle: "x" }],
      }),
    ).toBe("");
  });
});

describe("renderDifferentiationBlock — renders valid rows", () => {
  test("full row → Markdown block starting with its own heading", () => {
    const block = renderDifferentiationBlock(OK_ROW);
    expect(block.startsWith("# Competitive differentiation")).toBe(true);
    expect(block).toContain("24/7 emergency service (emphasized by 3 competitors)");
    expect(block).toContain("Free quotes (emphasized by 2 competitors)");
    expect(block).toContain(
      "Humidity-specific maintenance — No competitor speaks to Panama's coastal humidity wear.",
    );
  });

  test("singular phrasing when prevalence_count is 1", () => {
    const block = renderDifferentiationBlock({
      common_themes: [{ theme: "Solo theme", prevalence_count: 1 }],
      positioning_gaps: [],
    });
    expect(block).toContain("emphasized by 1 competitor)");
    expect(block).not.toContain("1 competitors");
  });

  test("themes only (no gaps) still renders the themes section", () => {
    const block = renderDifferentiationBlock({
      common_themes: [{ theme: "Only theme", prevalence_count: 2 }],
      positioning_gaps: [],
    });
    expect(block.startsWith("# Competitive differentiation")).toBe(true);
    expect(block).toContain("Only theme");
    expect(block).not.toContain("Open positioning gaps");
  });

  test("gaps only (no themes) still renders the gaps section", () => {
    const block = renderDifferentiationBlock({
      common_themes: [],
      positioning_gaps: [{ angle: "Lone gap", rationale: "because" }],
    });
    expect(block.startsWith("# Competitive differentiation")).toBe(true);
    expect(block).toContain("Lone gap — because");
    expect(block).not.toContain("These angles are crowded");
  });
});

describe("differentiationContextBlocks — extraContext array for the route", () => {
  test("null row → empty array (inject nothing)", () => {
    expect(differentiationContextBlocks(null)).toEqual([]);
  });

  test("low-confidence row → empty array", () => {
    expect(
      differentiationContextBlocks({ common_themes: [], positioning_gaps: [] }),
    ).toEqual([]);
  });

  test("ok row → single-block array", () => {
    const blocks = differentiationContextBlocks(OK_ROW);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.startsWith("# Competitive differentiation")).toBe(true);
  });
});
