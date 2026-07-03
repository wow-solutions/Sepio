import type { Tables } from "@/lib/supabase/database.types";
import {
  differentiationContextBlocks,
  type DifferentiationRowInput,
} from "@/lib/market-brain/differentiation-context";
import {
  mergeRuleWords,
  renderVoiceNoteBlocks,
  type BrandRuleInput,
} from "@/lib/brand-rules/rules-context";
import { clientBrainContextBlocks } from "@/lib/client-brain/client-brain-context";

// Single source of truth for the "moat" prompt assembly shared by the generate
// route (LinkedIn + blog) and the variants fan-out route. Both used to inline the
// SAME sequence — Market Brain (T8) + Client Brain + Editorial Memory (T6) — and
// they drifted (variants dropped Client Brain). Centralizing kills the copy-paste
// gap while keeping the byte-stable ordering the prompt cache depends on.
//
// PURE: no DB reads. The routes fetch (diff row, rules, proof rows) with their own
// per-read error discipline and pass the already-resolved values in — a read
// error resolves to null/[] at the call site, never here.

type BrandConfig = Tables<"brand_configs">;

export type AssembleMoatContextInput = {
  // brand_configs row (already fetched, RLS-scoped). services/locations/pricing
  // live here; forbidden_words/required_phrases get merged with rule words below.
  config: BrandConfig;
  // market_differentiation row, or null when absent/read-errored.
  diffRow: DifferentiationRowInput | null | undefined;
  // Active brand_rules, already sorted (created_at, id) for byte-stable assembly.
  rules: BrandRuleInput[];
  // proof_items rows (raw jsonb re-validated inside clientBrainContextBlocks),
  // already ordered (created_at, id) at the call site for cache stability.
  proofRows: unknown[];
};

export type AssembleMoatContextResult = {
  configForGen: BrandConfig;
  extraContext: string[];
};

// Merge word-type rules into the config columns (so buildBrandContext emits ONE
// deduped section) and assemble the extraContext seam blocks. The block ORDER —
// differentiation → clientBrain → voiceNotes — is a prompt-cache invariant: keep
// it byte-stable so a brand not using a feature keeps an identical (cache-warm)
// prompt. Do NOT reorder.
export function assembleMoatContext({
  config,
  diffRow,
  rules,
  proofRows,
}: AssembleMoatContextInput): AssembleMoatContextResult {
  const mergedWords = mergeRuleWords(
    rules,
    config.forbidden_words ?? [],
    config.required_phrases ?? [],
  );
  const configForGen = {
    ...config,
    forbidden_words: mergedWords.forbidden,
    required_phrases: mergedWords.required,
  };

  const extraContext = [
    ...differentiationContextBlocks(diffRow),
    ...clientBrainContextBlocks({
      services: config.services,
      locations: config.locations,
      pricing: config.pricing,
      proofItems: proofRows,
    }),
    ...renderVoiceNoteBlocks(rules),
  ];

  return { configForGen, extraContext };
}
