// Whether a brand has ENOUGH usable Client Brain facts to justify the blog
// generation prompt's "weave in facts" directive (geo-facts-targeting). A fact
// is usable when it's a citable, verified specific — not every proof_items
// `kind` qualifies (testimonial/source_fact are opinion/context, not a stat to
// weave in), and an unverified claim isn't safe to cite either.
//
// Kinds mirror the ProofItemSchema enum (lib/client-brain/schema.ts:35..41).

const USABLE_KINDS = new Set(["metric", "certification", "case_study"]);

export function countUsableFacts(items: { kind: string; verifiable: boolean }[]): number {
  return items.filter((i) => USABLE_KINDS.has(i.kind) && i.verifiable === true).length;
}
