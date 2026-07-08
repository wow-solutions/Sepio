import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildBrandContext,
  buildGenerateResult,
  ClaudeError,
  generatePost,
  generateBlogArticle,
} from "./claude";
import type { Tables } from "./supabase/database.types";

type BrandConfig = Tables<"brand_configs">;

function fixtureConfig(overrides: Partial<BrandConfig> = {}): BrandConfig {
  return {
    brand_id: "00000000-0000-0000-0000-000000000000",
    updated_at: new Date().toISOString(),
    brand_voice: "Direct, technical, no fluff.",
    target_market: null,
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

describe("buildBrandContext — output language", () => {
  test("instructs the brand's language (en) and not the old wording", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en");
    expect(ctx).toContain("Write the ENTIRE output in English");
    expect(ctx).not.toContain("Write in en,");
  });

  test("maps es/ru/pt to language names", () => {
    expect(buildBrandContext(fixtureConfig(), "es")).toContain(
      "Write the ENTIRE output in Spanish",
    );
    expect(buildBrandContext(fixtureConfig(), "ru")).toContain(
      "Write the ENTIRE output in Russian",
    );
    expect(buildBrandContext(fixtureConfig(), "pt")).toContain(
      "Write the ENTIRE output in Portuguese",
    );
  });

  test("forbids mirroring the input language (drift guard)", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en");
    expect(ctx).toContain("Never switch to or mirror the input language");
  });

  test("forbids mirroring the VOICE SAMPLE language — emulate style, write in target", () => {
    // A Spanish brand whose voice sample is Russian must still output Spanish:
    // the sample teaches style, not language.
    const ctx = buildBrandContext(
      { ...fixtureConfig(), voice_samples: [{ text: "Пример русского голоса." }] },
      "es",
    );
    // The instruction names the voice samples as a language source to ignore...
    expect(ctx).toContain("OR the voice samples below");
    // ...while still emulating their style in the target language.
    expect(ctx).toContain("render the style in Spanish");
    // The voice-sample block itself still renders (style is kept).
    expect(ctx).toContain("# Voice samples (how this brand actually writes)");
  });

  test("language instruction precedes the output-only instruction", () => {
    const ctx = buildBrandContext(fixtureConfig(), "en");
    const lang = ctx.indexOf("Write the ENTIRE output");
    const outputOnly = ctx.indexOf("Output ONLY the content itself");
    expect(lang).toBeGreaterThanOrEqual(0);
    expect(outputOnly).toBeGreaterThan(lang);
  });

  test("empty primary_language falls back to English", () => {
    const ctx = buildBrandContext(fixtureConfig(), "");
    expect(ctx).toContain("Write the ENTIRE output in English");
  });

  test("unknown ISO code falls through to the code itself", () => {
    const ctx = buildBrandContext(fixtureConfig(), "de");
    expect(ctx).toContain("Write the ENTIRE output in de,");
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

describe("generateBlogArticle — guards", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  test("rejects an empty brief before touching the API", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-not-real";
    await expect(
      generateBlogArticle(fixtureConfig(), "en", "   "),
    ).rejects.toThrow(/brief is empty/);
  });

  test("throws ClaudeError when ANTHROPIC_API_KEY missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      generateBlogArticle(fixtureConfig(), "en", "a real brief about HVAC humidity"),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

// Fixture Anthropic.Message. Only the fields buildGenerateResult reads are
// meaningful; the rest are cast through `unknown` so the fixture doesn't have
// to track every field of the SDK's response shape.
function fixtureMessage(overrides: {
  content?: Anthropic.ContentBlock[];
  stop_reason?: Anthropic.Message["stop_reason"];
  usage?: Partial<Anthropic.Usage>;
}): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    model: "claude-sonnet-4-6",
    role: "assistant",
    stop_details: null,
    stop_sequence: null,
    type: "message",
    content: overrides.content ?? [{ type: "text", text: "hello", citations: [] }],
    stop_reason: overrides.stop_reason ?? "end_turn",
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
      ...overrides.usage,
    },
  } as unknown as Anthropic.Message;
}

describe("buildGenerateResult", () => {
  test("stop_reason max_tokens -> truncated: true", () => {
    const result = buildGenerateResult(fixtureMessage({ stop_reason: "max_tokens" }));
    expect(result.truncated).toBe(true);
  });

  test("stop_reason end_turn -> truncated: false", () => {
    const result = buildGenerateResult(fixtureMessage({ stop_reason: "end_turn" }));
    expect(result.truncated).toBe(false);
  });

  test("empty content -> throws ClaudeError", () => {
    expect(() => buildGenerateResult(fixtureMessage({ content: [] }))).toThrow(
      ClaudeError,
    );
  });

  test("multiple text blocks are joined with newlines", () => {
    const result = buildGenerateResult(
      fixtureMessage({
        content: [
          { type: "text", text: "first block", citations: [] },
          { type: "text", text: "second block", citations: [] },
        ],
      }),
    );
    expect(result.text).toBe("first block\nsecond block");
  });
});
