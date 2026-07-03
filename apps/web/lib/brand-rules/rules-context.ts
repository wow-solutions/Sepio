import { RenderableRuleSchema, type RenderableRule } from "./schema";

// Render active brand_rules (Editorial Memory) for the generation prompt. PUBLIC —
// this is formatting of the user's own confirmed rules, never third-party data, so
// it sits on the trust-adjacent side of the moat (the extraction PROMPT is _private).
//
// Two integration constraints (see generate route wiring, T6):
//   1. ONE merged section per word-type (Success Criteria 3b). A forbidden_word
//      RULE and a brand_configs.forbidden_words COLUMN value must render as a single
//      deduped "Never use these words" section, not two. buildBrandContext already
//      renders that section from the config columns, so the route MERGES rule words
//      INTO the config (mergeRuleWords) and lets buildBrandContext emit the single
//      section. For a brand with no word rules, mergeRuleWords returns the config
//      lists unchanged → identical prompt → cache stays warm (no churn).
//   2. voice_note rules have no column equivalent, so they inject as their own
//      brand-stable blocks via the seam (renderVoiceNoteBlocks). Block order is
//      fixed for byte-stable prompt assembly (cache invariant, Codex #4-7); the
//      caller passes rules already sorted by (created_at, id).
//
// Dedup is WHOLE-TOKEN (case-insensitive trimmed equality), NOT substring: "Most"
// and "most" collapse to one; "AI" never collapses into "paid" (Codex #12 — that
// substring trap belongs to the conflict check in T7, not to dedup).

export type BrandRuleInput = {
  rule_type: unknown;
  scope: unknown;
  rule_text: unknown;
};

// Re-validate raw rows at the read boundary (RLS proves ownership, not shape).
// Invalid rows are dropped, never thrown.
function validate(rules: BrandRuleInput[] | null | undefined): RenderableRule[] {
  const out: RenderableRule[] = [];
  for (const row of rules ?? []) {
    const parsed = RenderableRuleSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// The renderable SUBSET of raw rows, keeping the original row objects (extra
// columns like id/human_label survive). Single source of truth for "which rules
// actually reach the prompt": the W2 applied-rules receipt filters through THIS,
// so it can never count a malformed row that validate() above would drop.
export function filterRenderableRules<T extends BrandRuleInput>(
  rules: T[] | null | undefined,
): T[] {
  return (rules ?? []).filter(
    (row) => RenderableRuleSchema.safeParse(row).success,
  );
}

function dedupMerge(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const text = (raw ?? "").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}

// Merge forbidden_word / required_phrase rules into the brand_configs word columns.
// Config words come first (order preserved), then net-new rule words. Pure; with no
// matching rules and a clean config, returns the config lists unchanged.
export function mergeRuleWords(
  rules: BrandRuleInput[] | null | undefined,
  configForbidden: string[] = [],
  configRequired: string[] = [],
): { forbidden: string[]; required: string[] } {
  const valid = validate(rules);
  const ruleForbidden = valid
    .filter((r) => r.rule_type === "forbidden_word")
    .map((r) => r.rule_text);
  const ruleRequired = valid
    .filter((r) => r.rule_type === "required_phrase")
    .map((r) => r.rule_text);
  return {
    forbidden: dedupMerge(configForbidden, ruleForbidden),
    required: dedupMerge(configRequired, ruleRequired),
  };
}

function bulletBlock(heading: string, items: string[]): string | null {
  if (items.length === 0) return null;
  return `${heading}\n${items.map((t) => `- ${t}`).join("\n")}`;
}

// Render voice_note rules as scope-grouped context blocks for the seam. Fixed
// order (opening → body → global) for byte-stability. Returns [] to inject nothing.
export function renderVoiceNoteBlocks(
  rules: BrandRuleInput[] | null | undefined,
): string[] {
  const valid = validate(rules);
  const voiceBy = (scope: RenderableRule["scope"]) =>
    valid
      .filter((r) => r.rule_type === "voice_note" && r.scope === scope)
      .map((r) => r.rule_text);

  const blocks: (string | null)[] = [
    bulletBlock("# Opening rules", voiceBy("opening")),
    bulletBlock("# Body rules", voiceBy("body")),
    bulletBlock("# Voice rules", voiceBy("global")),
  ];
  return blocks.filter((b): b is string => b !== null);
}
