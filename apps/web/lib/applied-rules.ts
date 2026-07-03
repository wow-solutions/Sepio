import { z } from "zod";

// W2 applied-rules receipt — the shared SHAPE of one snapshot line persisted in
// posts.applied_rules jsonb: {id, rule_type, scope, label} at generation time.
// Lives in its own tiny module (not moat-context) so client components can
// import the type + read-boundary coercion without pulling the server-side
// prompt-assembly code into the bundle.
//
// rule_type/scope are plain strings on purpose: the snapshot must survive a
// future rule-type rename without invalidating old receipts — the UI maps known
// values to i18n labels and falls back to the raw string.

export const AppliedRuleSchema = z.object({
  id: z.string(),
  rule_type: z.string(),
  scope: z.string(),
  label: z.string(),
});

export type AppliedRule = z.infer<typeof AppliedRuleSchema>;

// Coerce a raw posts.applied_rules jsonb value at a read boundary. Semantics
// mirror the column (null ≠ []): anything that isn't an array — including the
// pre-W2 null — means "not tracked" → null (no receipt); an array keeps only
// well-shaped items (RLS proves ownership, not shape).
export function coerceAppliedRules(value: unknown): AppliedRule[] | null {
  if (!Array.isArray(value)) return null;
  const out: AppliedRule[] = [];
  for (const item of value) {
    const parsed = AppliedRuleSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
