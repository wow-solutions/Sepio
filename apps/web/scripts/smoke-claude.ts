// One-off smoke test for ANTHROPIC_API_KEY. Run with:
//   bun --env-file=.env.local scripts/smoke-claude.ts
// Cost: ~$0.008 per run.

import { generatePost } from "../lib/claude";
import type { Tables } from "../lib/supabase/database.types";

const fixture: Tables<"brand_configs"> = {
  brand_id: "00000000-0000-0000-0000-000000000000",
  updated_at: new Date().toISOString(),
  brand_voice: "Direct, technical, no fluff. Writes like a senior engineer.",
  target_market: null,
  tone_attributes: ["professional", "warm"],
  forbidden_words: ["leverage", "synergy"],
  required_phrases: [],
  voc_pain_points: [{ quote: "My old AC keeps breaking every summer." }],
  voc_desired_outcomes: [{ quote: "I want it to just work for 10 years." }],
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
};

const start = Date.now();
const result = await generatePost(fixture, "en", "summer AC maintenance for Panama humidity");
const ms = Date.now() - start;

console.log("---DRAFT---");
console.log(result.text);
console.log("---USAGE---");
console.log(`time:           ${ms}ms`);
console.log(`input tokens:   ${result.usage.input_tokens}`);
console.log(`output tokens:  ${result.usage.output_tokens}`);
console.log(`cache create:   ${result.usage.cache_creation_input_tokens}`);
console.log(`cache read:     ${result.usage.cache_read_input_tokens}`);
