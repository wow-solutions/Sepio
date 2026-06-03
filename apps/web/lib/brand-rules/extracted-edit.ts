import { z } from "zod";
import { RULE_TYPES, RULE_SCOPES } from "./schema";

// PUBLIC (trust-adjacent) shape boundary for what the rule extractor RETURNS.
// The extraction PROMPT is moat (_private/rule-extractor.ts); this is only the
// typed shape of its response, so it lives public — mirroring how Market Brain's
// _private differentiation-engine.ts imports its DifferentiationSchema from the
// public derived-only.ts.
//
// Contract (design D1, Codex #1): the extractor classifies the edit and proposes
// memory. It does NOT return a rewritten_post — the rewrite is a SEPARATE,
// concurrent call (refineRewrite). Three kinds, two-target routing:
//   - voice_rule → proposed_rule present  → persisted to brand_rules (managed).
//   - brand_fact → proposed_fact present  → NUDGE only, never auto-written in v1.
//   - one_off    → both null              → rewrite-only, persist nothing.

export const EDIT_KINDS = ["voice_rule", "brand_fact", "one_off"] as const;
export type EditKind = (typeof EDIT_KINDS)[number];

export const OVERGENERALIZATION_RISKS = ["low", "medium", "high"] as const;
export type OvergeneralizationRisk = (typeof OVERGENERALIZATION_RISKS)[number];

export const FACT_AREAS = ["offering", "audience", "process"] as const;
export type FactArea = (typeof FACT_AREAS)[number];

// A proposed editorial rule. Shape matches the persisted brand_rules columns the
// confirm card lets the user review/edit (human_label, rule_text, rule_type,
// scope are editable; rationale is read-only context). No `confidence` — cut from
// v1 (design Data model). The Cl2 scope constraint (forbidden/required ⇒ global)
// is normalized in the extractor, not refined here, so a routing slip becomes a
// corrected rule rather than a hard extraction failure.
export const ProposedRuleSchema = z.object({
  rule_type: z.enum(RULE_TYPES),
  scope: z.enum(RULE_SCOPES),
  rule_text: z.string().trim().min(1),
  human_label: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
});
export type ProposedRule = z.infer<typeof ProposedRuleSchema>;

// A proposed business fact — the NUDGE payload. v1 NEVER auto-writes this into
// brand_configs (asymmetric blast radius: a misclassified fact corrupts every
// future post with no undo). suggested_area only colors the nudge copy.
export const ProposedFactSchema = z.object({
  human_label: z.string().trim().min(1),
  fact_text: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  suggested_area: z.enum(FACT_AREAS),
});
export type ProposedFact = z.infer<typeof ProposedFactSchema>;

export const SafetyCheckSchema = z.object({
  overgeneralization_risk: z.enum(OVERGENERALIZATION_RISKS),
  warning: z.string().trim().min(1).optional(),
});
export type SafetyCheck = z.infer<typeof SafetyCheckSchema>;

// Raw extractor output as parsed from the model. Sub-payloads are nullable; the
// extractor's normalizeExtractedEdit enforces edit_kind ⟷ payload consistency
// AND the Cl2 scope rule, returning a clean, guaranteed-consistent ExtractedEdit
// (or a structured error when a required payload is missing).
export const RawExtractedEditSchema = z.object({
  edit_kind: z.enum(EDIT_KINDS),
  proposed_rule: ProposedRuleSchema.nullable().optional(),
  proposed_fact: ProposedFactSchema.nullable().optional(),
  safety_check: SafetyCheckSchema,
});
export type RawExtractedEdit = z.infer<typeof RawExtractedEditSchema>;

// The normalized, consistent result the route consumes. Exactly one of
// proposed_rule / proposed_fact is non-null (or both null for one_off).
export type ExtractedEdit = {
  edit_kind: EditKind;
  proposed_rule: ProposedRule | null;
  proposed_fact: ProposedFact | null;
  safety_check: SafetyCheck;
};
