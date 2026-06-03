import type {
  EditKind,
  ExtractedEdit,
  ProposedFact,
  ProposedRule,
  SafetyCheck,
} from "./extracted-edit";

// PUBLIC, pure shaping of the refine route's response from its two parallel
// outcomes (rewrite call + rule extraction). Lives public and imports ONLY the
// public ExtractedEdit type — never _private — so the mirror stays clean.
//
// The two calls are independent (design D1): spec the asymmetric outcomes so a
// failure of one never blocks the other (design-review #5, partial-success):
//   - rewrite OK + extract OK      → full result (diff + rule card + checkbox).
//   - rewrite OK + extract FAILED  → 200, show diff + Apply (post-only), quiet
//                                    "couldn't draft a rule" note (extract_failed).
//   - rewrite FAILED/empty + extract OK → 200, no_rewrite path (save-rule-only).
//   - both unusable                → 502 (nothing to act on; user rephrases).
//
// "no_rewrite" means there is no rewrite to apply — the call failed, returned
// empty, OR returned text byte-identical to the source (no change needed).

export type RefineResponseBody = {
  rewritten_post: string | null;
  no_rewrite: boolean;
  edit_kind: EditKind | null;
  proposed_rule: ProposedRule | null;
  proposed_fact: ProposedFact | null;
  safety_check: SafetyCheck | null;
  // The rewrite ran but the rule extraction failed — show the diff, no rule card.
  extract_failed: boolean;
};

export type RefineErrorBody = { error: string; stage: "extract" | "rewrite" };

export type RewriteOutcome = { ok: boolean; text?: string };

export type RefineResult =
  | { status: 200; body: RefineResponseBody }
  | { status: 502; body: RefineErrorBody };

export function buildRefineResult(args: {
  originalPost: string;
  rewrite: RewriteOutcome;
  edit: ExtractedEdit | null;
}): RefineResult {
  const { originalPost, rewrite, edit } = args;

  const candidate = (rewrite.ok ? rewrite.text ?? "" : "").trim();
  const hasRewrite = candidate.length > 0 && candidate !== originalPost.trim();
  const extractOk = edit !== null;

  // Nothing usable from either call → the instruction did not act. Rephrase.
  if (!hasRewrite && !extractOk) {
    return {
      status: 502,
      body: {
        error: "couldn't read that — try rephrasing the instruction",
        stage: "extract",
      },
    };
  }

  return {
    status: 200,
    body: {
      rewritten_post: hasRewrite ? candidate : null,
      no_rewrite: !hasRewrite,
      edit_kind: edit?.edit_kind ?? null,
      proposed_rule: edit?.proposed_rule ?? null,
      proposed_fact: edit?.proposed_fact ?? null,
      safety_check: edit?.safety_check ?? null,
      extract_failed: !extractOk,
    },
  };
}
