import { z } from "zod";

// PUBLIC moat boundary for Market Brain (T7). market_differentiation is the only
// persistent Market Brain artifact, and it must hold ONLY derived features —
// never raw competitor text. This module is the typed, testable enforcement of
// that rule. It is intentionally public (mirrored): the boundary that proves we
// don't store scraped third-party prose is exactly the kind of thing the public
// repo should show. It imports nothing from _private.
//
// Two guarantees:
//   1. Shape — Zod schemas reject free-text; differentiation is structured arrays
//      of typed objects, so a model can't smuggle prose through as one big string.
//   2. Content — assertNoRawCompetitorText throws if any derived field reproduces
//      a long verbatim run of the scraped extract (paraphrase, don't copy).

export const CommonThemeSchema = z.object({
  // A messaging theme several competitors emphasize (the model's own words).
  theme: z.string().min(1),
  // How many of the supplied competitors emphasize it (grounded, ≥1).
  prevalence_count: z.number().int().min(1),
});

export const PositioningGapSchema = z.object({
  // A messaging/positioning angle few or no competitors cover (whitespace).
  angle: z.string().min(1),
  // Why it's a gap the brand could own.
  rationale: z.string().min(1),
});

export const DifferentiationSchema = z.object({
  common_themes: z.array(CommonThemeSchema),
  positioning_gaps: z.array(PositioningGapSchema),
});

export type CommonTheme = z.infer<typeof CommonThemeSchema>;
export type PositioningGap = z.infer<typeof PositioningGapSchema>;
export type Differentiation = z.infer<typeof DifferentiationSchema>;

export class RawTextLeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RawTextLeakError";
  }
}

// Minimum verbatim run (chars, after whitespace/case normalization) that counts
// as reproducing competitor text. Short overlaps (industry terms, "HVAC repair")
// are unavoidable and fine; a 40-char identical run is lifted prose.
const MIN_VERBATIM_OVERLAP = 40;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Throws RawTextLeakError if any derived field reproduces a >= minOverlap-char
// substring of the raw competitor corpus. `rawCorpus` is the scraped extract
// strings (title/meta/headings/paragraphs) — the caller (the _private engine)
// assembles them; this public boundary stays free of _private types.
export function assertNoRawCompetitorText(
  diff: Differentiation,
  rawCorpus: string[],
  minOverlap: number = MIN_VERBATIM_OVERLAP,
): void {
  const corpus = normalize(rawCorpus.join("\n"));
  if (!corpus) return;

  const fields: string[] = [
    ...diff.common_themes.map((t) => t.theme),
    ...diff.positioning_gaps.flatMap((g) => [g.angle, g.rationale]),
  ];

  for (const field of fields) {
    const f = normalize(field);
    if (f.length < minOverlap) continue;
    for (let i = 0; i + minOverlap <= f.length; i++) {
      const window = f.slice(i, i + minOverlap);
      if (corpus.includes(window)) {
        throw new RawTextLeakError(
          `derived field reproduces ${minOverlap}+ chars of competitor text: "…${window}…"`,
        );
      }
    }
  }
}
