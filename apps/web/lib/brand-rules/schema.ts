import { z } from "zod";

// PUBLIC (trust-adjacent) shape boundary for Editorial Memory rules. The
// extraction PROMPT is moat (_private/rule-extractor.ts); this is just the typed
// shape of a persisted/rendered rule, so it lives public alongside the render
// helper — like derived-only.ts for Market Brain. Imports nothing from _private.
//
// brand_rules rows are read back as raw columns; RLS proves ownership, not shape.
// So the render boundary (rules-context.ts) re-validates with this schema —
// malformed rows render nothing rather than smuggling junk into the prompt.

export const RULE_TYPES = ["forbidden_word", "required_phrase", "voice_note"] as const;
export const RULE_SCOPES = ["opening", "body", "global"] as const;

export type RuleType = (typeof RULE_TYPES)[number];
export type RuleScope = (typeof RULE_SCOPES)[number];

// Render-relevant shape of an active rule. (human_label / rationale / etc. are
// management concerns — T7 may extend this; render needs only these three.)
// The refine mirrors the DB CHECK (Cl2): opening/body only make sense for
// voice_note; forbidden_word / required_phrase must be global. A row violating
// it (shouldn't exist past the CHECK) fails validation → skipped, not rendered.
export const RenderableRuleSchema = z
  .object({
    rule_type: z.enum(RULE_TYPES),
    scope: z.enum(RULE_SCOPES),
    rule_text: z.string().trim().min(1),
  })
  .refine((r) => r.rule_type === "voice_note" || r.scope === "global", {
    message: "forbidden_word / required_phrase rules must have scope=global",
  });

export type RenderableRule = z.infer<typeof RenderableRuleSchema>;
