import {
  DifferentiationSchema,
  type Differentiation,
} from "./derived-only";

// Render the Market Brain differentiation artifact into a brand-stable context
// block for the generation seam (T8, PR-A). PUBLIC — this is formatting of
// already-derived features (themes / gaps), never raw competitor text, so it
// belongs on the same side of the moat boundary as derived-only.ts.
//
// The persisted row's common_themes / positioning_gaps are raw `jsonb`: RLS
// proves ownership, not shape. So we re-validate with DifferentiationSchema at
// this read boundary (defense in depth) — malformed data renders nothing rather
// than smuggling junk into the prompt.
//
// "Low confidence" has no column: by convention it is BOTH arrays empty (the
// worker upserts empty arrays when <2 usable competitors). So an empty/low row
// renders "" and the caller injects nothing — generation behaves as if Market
// Brain were off (decision D3, silent skip).
//
//   row (jsonb) ──Zod──▶ valid? ──no──▶ ""           (skip; caller logs nothing)
//                          │
//                         yes
//                          ▼
//                  both arrays empty? ──yes──▶ ""      (low confidence; skip)
//                          │
//                          no
//                          ▼
//                  Markdown block "# Competitive differentiation …"

export type DifferentiationRowInput = {
  common_themes: unknown;
  positioning_gaps: unknown;
};

function renderBlock(diff: Differentiation): string {
  const lines: string[] = ["# Competitive differentiation"];

  if (diff.common_themes.length > 0) {
    lines.push(
      "These angles are crowded — most of this brand's competitors already " +
        "emphasize them. Don't present them as if they were unique:",
    );
    for (const t of diff.common_themes) {
      const n = t.prevalence_count;
      const who = n === 1 ? "1 competitor" : `${n} competitors`;
      lines.push(`- ${t.theme} (emphasized by ${who})`);
    }
  }

  if (diff.positioning_gaps.length > 0) {
    lines.push(
      "Open positioning gaps this brand can own — lean into these angles when relevant:",
    );
    for (const g of diff.positioning_gaps) {
      lines.push(`- ${g.angle} — ${g.rationale}`);
    }
  }

  return lines.join("\n");
}

// Pure: persisted row fields -> a single Markdown block, or "" to skip.
// Returns "" when the row is null, the shape is invalid, or both arrays are
// empty (low confidence). Never throws.
export function renderDifferentiationBlock(
  row: DifferentiationRowInput | null | undefined,
): string {
  if (!row) return "";

  const parsed = DifferentiationSchema.safeParse({
    common_themes: row.common_themes,
    positioning_gaps: row.positioning_gaps,
  });
  if (!parsed.success) return "";

  const diff = parsed.data;
  if (diff.common_themes.length === 0 && diff.positioning_gaps.length === 0) {
    return "";
  }

  return renderBlock(diff);
}

// Convenience for the generate route: a row (or null on absent/error) -> the
// `extraContext` array passed to generatePost / adaptToLinkedIn. Empty array
// means "inject nothing".
export function differentiationContextBlocks(
  row: DifferentiationRowInput | null | undefined,
): string[] {
  const block = renderDifferentiationBlock(row);
  return block ? [block] : [];
}
