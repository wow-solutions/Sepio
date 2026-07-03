import { describe, expect, test } from "bun:test";
import { assembleMoatContext } from "./moat-context";
import type { Tables } from "./supabase/database.types";
import type { BrandRuleInput } from "./brand-rules/rules-context";
import type { DifferentiationRowInput } from "./market-brain/differentiation-context";

type BrandConfig = Tables<"brand_configs">;

function fixtureConfig(overrides: Partial<BrandConfig> = {}): BrandConfig {
  return {
    brand_id: "00000000-0000-0000-0000-000000000000",
    updated_at: new Date().toISOString(),
    brand_voice: "Direct, technical, no fluff.",
    tone_attributes: [],
    forbidden_words: [],
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

const diffRow: DifferentiationRowInput = {
  common_themes: [{ theme: "energy efficiency", prevalence_count: 3 }],
  positioning_gaps: [],
};

const voiceRule: BrandRuleInput = {
  rule_type: "voice_note",
  scope: "global",
  rule_text: "Write like you talk.",
};

describe("assembleMoatContext", () => {
  test("block order is differentiation → clientBrain → voiceNotes", () => {
    const { extraContext } = assembleMoatContext({
      config: fixtureConfig({
        services: [{ name: "AC install" }],
        locations: ["Panama City"],
      }),
      diffRow,
      rules: [voiceRule],
      proofRows: [
        { kind: "certification", body: "EPA 608 certified", verifiable: true },
      ],
    });

    // Three blocks present, in the fixed byte-stable order.
    expect(extraContext).toHaveLength(3);
    expect(extraContext[0]).toContain("# Competitive differentiation");
    expect(extraContext[1]).toContain("# Client facts");
    expect(extraContext[2]).toContain("# Voice rules");

    const diffAt = extraContext.findIndex((b) => b.includes("Competitive differentiation"));
    const clientAt = extraContext.findIndex((b) => b.includes("Client facts"));
    const voiceAt = extraContext.findIndex((b) => b.includes("Voice rules"));
    expect(diffAt).toBeLessThan(clientAt);
    expect(clientAt).toBeLessThan(voiceAt);
  });

  test("empty inputs produce no extra blocks and a word-equivalent config", () => {
    const config = fixtureConfig({
      forbidden_words: ["synergy"],
      required_phrases: ["ready when you are"],
    });
    const { configForGen, extraContext } = assembleMoatContext({
      config,
      diffRow: null,
      rules: [],
      proofRows: [],
    });

    expect(extraContext).toEqual([]);
    // No word rules + clean config → the merge is a no-op on the word columns.
    expect(configForGen.forbidden_words).toEqual(config.forbidden_words);
    expect(configForGen.required_phrases).toEqual(config.required_phrases);
  });

  test("is deterministic — identical inputs yield identical strings", () => {
    const input = {
      config: fixtureConfig({
        services: [{ name: "AC install", description: "same-day" }],
        pricing: [{ label: "Diagnostic", detail: "$50" }],
      }),
      diffRow,
      rules: [voiceRule],
      proofRows: [{ kind: "metric" as const, body: "12k jobs", verifiable: false }],
    };
    const a = assembleMoatContext(input);
    const b = assembleMoatContext(input);
    expect(a.extraContext).toEqual(b.extraContext);
    expect(a.configForGen.forbidden_words).toEqual(b.configForGen.forbidden_words);
    expect(a.configForGen.required_phrases).toEqual(b.configForGen.required_phrases);
  });

  test("mergeRuleWords effect is visible in configForGen", () => {
    const config = fixtureConfig({ forbidden_words: ["synergy"] });
    const { configForGen } = assembleMoatContext({
      config,
      diffRow: null,
      rules: [
        { rule_type: "forbidden_word", scope: "global", rule_text: "leverage" },
        { rule_type: "required_phrase", scope: "global", rule_text: "let's dig in" },
      ],
      proofRows: [],
    });

    // Config word kept, net-new rule word appended (order preserved).
    expect(configForGen.forbidden_words).toEqual(["synergy", "leverage"]);
    expect(configForGen.required_phrases).toEqual(["let's dig in"]);
  });
});
