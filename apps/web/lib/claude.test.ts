import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { buildBrandContext, ClaudeError, generatePost } from "./claude";
import type { Tables } from "./supabase/database.types";

type BrandConfig = Tables<"brand_configs">;

function fixtureConfig(overrides: Partial<BrandConfig> = {}): BrandConfig {
  return {
    brand_id: "00000000-0000-0000-0000-000000000000",
    updated_at: new Date().toISOString(),
    brand_voice: "Direct, technical, no fluff.",
    tone_attributes: ["professional", "warm"],
    forbidden_words: ["leverage", "synergy"],
    required_phrases: [],
    voc_pain_points: [],
    voc_desired_outcomes: [],
    trigger_events: [],
    seo_keywords_primary: [],
    seo_keywords_secondary: [],
    ai_seo_factors: {},
    internal_links_map: [],
    style_guide: null,
    approval_mode: "manual",
    voice_samples: [],
    services: [],
    locations: [],
    pricing: [],
    forbidden_claims: [],
    voice_fingerprint: null,
    ...overrides,
  };
}

describe("buildBrandContext", () => {
  test("includes brand_voice when present", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en");
    expect(ctx).toContain("Direct, technical, no fluff.");
  });

  test("omits sections when arrays are empty", () => {
    const ctx = buildBrandContext(
      fixtureConfig({ forbidden_words: [], required_phrases: [] }),
      "en",
    );
    expect(ctx).not.toContain("Never use these words");
    expect(ctx).not.toContain("Weave in if natural");
  });

  test("renders forbidden words section", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en");
    expect(ctx).toContain("Never use these words");
    expect(ctx).toContain("leverage, synergy");
  });

  test("renders voice samples as numbered sections", () => {
    const ctx = buildBrandContext(
      fixtureConfig({
        voice_samples: [
          { text: "First sample line." },
          { text: "Second sample line." },
        ],
      }),
      "en",
    );
    expect(ctx).toContain("## Sample 1\nFirst sample line.");
    expect(ctx).toContain("## Sample 2\nSecond sample line.");
  });

  test("renders VOC pain points as quoted bullets", () => {
    const ctx = buildBrandContext(
      fixtureConfig({
        voc_pain_points: [
          { quote: "It always breaks in summer." },
          { quote: "Service is slow." },
        ],
      }),
      "en",
    );
    expect(ctx).toContain('- "It always breaks in summer."');
    expect(ctx).toContain('- "Service is slow."');
  });

  test("output is deterministic — same input produces same string", () => {
    const a = buildBrandContext(fixtureConfig(), "en");
    const b = buildBrandContext(fixtureConfig(), "en");
    expect(a).toBe(b);
  });
});

describe("buildBrandContext — context injection seam (T4)", () => {
  test("no extraContext leaves output identical to two-arg call", () => {
    const withDefault = buildBrandContext(fixtureConfig(), "en");
    const withEmpty = buildBrandContext(fixtureConfig(), "en", []);
    expect(withEmpty).toBe(withDefault);
  });

  test("appends injected blocks after the brand context", () => {
    const cfg = fixtureConfig({
      voice_samples: [{ text: "How the brand writes." }],
    });
    const ctx = buildBrandContext(cfg, "en", ["# Market differentiation\nWe do X."]);
    expect(ctx).toContain("# Market differentiation\nWe do X.");
    // Seam lands after the existing brand context (voice samples are last).
    expect(ctx.indexOf("# Market differentiation")).toBeGreaterThan(
      ctx.indexOf("# Voice samples"),
    );
  });

  test("preserves caller order across multiple blocks", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en", [
      "# First\na",
      "# Second\nb",
    ]);
    expect(ctx.indexOf("# First")).toBeLessThan(ctx.indexOf("# Second"));
  });

  test("drops blank and whitespace-only blocks", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en", [
      "",
      "   \n  ",
      "# Kept\nreal content",
    ]);
    expect(ctx).toContain("# Kept");
    // No empty separators leak in from the dropped blocks.
    expect(ctx).not.toMatch(/\n\n\n\n/);
  });

  // Cache invariant (T8 / Codex F4): the injected block lives in the brand-
  // context system block (block 1), which is format-independent. callClaude
  // builds the per-format directive as a SEPARATE block. So two formats for the
  // same brand + same extraContext share an identical block 1 → cache hit. The
  // real invariant is "block 1 is identical across formats", not "output equals
  // the no-block call".
  test("injected block is brand-stable — identical block 1 across format calls", () => {
    const cfg = fixtureConfig();
    const marketBlock = "# Competitive differentiation\nLean into humidity care.";
    // Both calls model the two format generations of one topic: same config,
    // same language, same extraContext. buildBrandContext takes no format arg —
    // proving block 1 cannot vary by format.
    const blockForFormatA = buildBrandContext(cfg, "en", [marketBlock]);
    const blockForFormatB = buildBrandContext(cfg, "en", [marketBlock]);
    expect(blockForFormatA).toBe(blockForFormatB);
    expect(blockForFormatA).toContain(marketBlock);
  });
});

describe("generatePost — auth & validation", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test("throws ClaudeError when ANTHROPIC_API_KEY missing", async () => {
    await expect(generatePost(fixtureConfig(), "en", "test")).rejects.toThrow(
      ClaudeError,
    );
    await expect(generatePost(fixtureConfig(), "en", "test")).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  test("accepts explicit apiKey option", async () => {
    // We don't actually call out — provide an obviously-bogus key and let the
    // SDK fail at the network layer; we only assert it gets past the missing-
    // key guard and surfaces a ClaudeError (any error message, but not the
    // missing-key one).
    let err: unknown;
    try {
      await generatePost(fixtureConfig(), "en", undefined, "linkedin_post", {
        apiKey: "sk-ant-test-key-not-real",
        signal: AbortSignal.timeout(1),
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ClaudeError);
    expect((err as ClaudeError).message).not.toMatch(/not configured/);
  });
});
