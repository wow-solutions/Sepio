import { z } from "zod";
import { RULE_TYPES, RULE_SCOPES, type RuleType } from "./schema";

// PUBLIC, pure validation for applying/managing a brand_rule (T7). The cap and
// the forbidden ⟷ required conflict check live here so they're unit-testable
// without Supabase, and trust-adjacent (no moat) so they mirror to public.

// Active-rule ceiling per brand (design: lowered 50→25; 50 voice_notes become
// contradictory sludge before token bloat). On hitting it, reject a NEW active
// rule with a clear message — never auto-evict.
export const ACTIVE_RULE_CAP = 25;

// The reviewed/edited rule the user applies. Mirrors the editable confirm-card
// fields; rationale is optional context (may be cleared). Cl2 scope rule is
// enforced here (forbidden_word / required_phrase must be global).
export const ApplyRuleSchema = z
  .object({
    rule_type: z.enum(RULE_TYPES),
    scope: z.enum(RULE_SCOPES),
    rule_text: z.string().trim().min(1).max(500),
    human_label: z.string().trim().min(1).max(120),
    rationale: z.string().trim().max(500).nullish(),
  })
  .refine((r) => r.rule_type === "voice_note" || r.scope === "global", {
    message: "forbidden_word / required_phrase rules must have scope=global",
  });

export type ApplyRule = z.infer<typeof ApplyRuleSchema>;

// Token-boundary match (Codex #12): does `needle` occur in `haystack` as a whole
// token rather than an arbitrary substring? A WORD-like needle ("AI") must sit on
// non-alphanumeric boundaries, so it never matches inside "paid". A SYMBOL needle
// ("->") has no word boundary, so it matches as a substring. Case-insensitive.
export function tokenMatch(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return false;

  const alnum = /[a-z0-9]/;
  const needleStartsAlnum = alnum.test(n[0]!);
  const needleEndsAlnum = alnum.test(n[n.length - 1]!);

  let from = 0;
  for (;;) {
    const idx = h.indexOf(n, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : h[idx - 1]!;
    const after = idx + n.length >= h.length ? "" : h[idx + n.length]!;
    const okBefore = !needleStartsAlnum || before === "" || !alnum.test(before);
    const okAfter = !needleEndsAlnum || after === "" || !alnum.test(after);
    if (okBefore && okAfter) return true;
    from = idx + 1;
  }
}

export type ConflictableRule = {
  rule_type: RuleType | string;
  rule_text: string;
  human_label?: string;
};

// A forbidden_word and a required_phrase contradict when one's text occurs as a
// whole token inside the other's — checked in BOTH directions. Returns the first
// conflicting existing rule (so the caller can name it), or null. voice_note ⟷
// voice_note conflicts are explicitly punted in v1 (user-managed).
export function findRuleConflict(
  candidate: ConflictableRule,
  existing: ConflictableRule[],
): ConflictableRule | null {
  const oppositeOf: Record<string, RuleType | null> = {
    forbidden_word: "required_phrase",
    required_phrase: "forbidden_word",
    voice_note: null,
  };
  const opposite = oppositeOf[candidate.rule_type];
  if (!opposite) return null;

  for (const ex of existing) {
    if (ex.rule_type !== opposite) continue;
    if (
      tokenMatch(candidate.rule_text, ex.rule_text) ||
      tokenMatch(ex.rule_text, candidate.rule_text)
    ) {
      return ex;
    }
  }
  return null;
}
