// POST /api/posts/[id]/refine — Editorial Memory write-half (T5).
//
// Given a post and a natural-language correction, runs TWO independent LLM calls
// CONCURRENTLY (design D1): refineRewrite (the rewrite half) + extractRule (the
// moat extractor that classifies the edit and proposes durable memory). Latency
// is max(call), not sum; the brand context is cached across both.
//
// Direct route (not a Server Action) because it's a heavy synchronous LLM call
// returning data to the client — same precedent as recompute-market-brain, and
// it sidesteps the after()-in-server-action gotcha. Auth is the session cookie.
//
// It only READS here. Persisting the rewrite and/or the rule is the explicit,
// reviewed Apply step (T7 server actions) — never auto-written from this route.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { refineRewrite } from "@/lib/claude";
import {
  mergeRuleWords,
  renderVoiceNoteBlocks,
} from "@/lib/brand-rules/rules-context";
import { buildRefineResult } from "@/lib/brand-rules/refine-response";
import { extractRule } from "@/lib/_private/rule-extractor";

export const maxDuration = 60; // two parallel LLM calls, latency = max not sum

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RequestSchema = z.object({
  instruction: z.string().trim().min(1).max(1000),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: postId } = await ctx.params;
  if (!UUID.test(postId)) {
    return Response.json({ error: "Invalid post id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { instruction } = parsed.data;

  // Post (RLS owner read).
  const { data: post } = await supabase
    .from("posts")
    .select("id, brand_id, content_text, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
  // Published guard (review C2): a published post can't be edited, so refining it
  // is pointless — fail loud, not silent.
  if (post.status === "published") {
    return Response.json(
      { error: "This post is published — refresh and start over" },
      { status: 409 },
    );
  }
  const original = post.content_text;
  if (!original || !original.trim()) {
    return Response.json({ error: "Post has no content to refine" }, { status: 400 });
  }

  // Brand + beta_access gate (reuse the Market Brain dogfood lock for new surfaces).
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, industry, primary_language, accounts!inner(beta_access)")
    .eq("id", post.brand_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (brandErr) {
    return Response.json({ error: brandErr.message }, { status: 500 });
  }
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  if (!brand.accounts.beta_access) {
    return Response.json({ error: "noBetaAccess" }, { status: 403 });
  }

  const { data: config } = await supabase
    .from("brand_configs")
    .select("*")
    .eq("brand_id", post.brand_id)
    .maybeSingle();
  if (!config) {
    return Response.json({ error: "Brand config missing" }, { status: 500 });
  }

  // Active rules — read once (F2): the extractor sees them (avoid exact dupes) and
  // the rewrite honors them (never reintroduce a banned pattern). Same stable sort
  // as the generate route for byte-identical assembly.
  const { data: ruleRows, error: rulesErr } = await supabase
    .from("brand_rules")
    .select("rule_type, scope, rule_text, human_label")
    .eq("brand_id", post.brand_id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (rulesErr) {
    console.error("brand_rules read failed:", rulesErr.message);
  }
  const rules = rulesErr ? [] : (ruleRows ?? []);

  // Inject active rules into the rewrite the same way generation does: merged word
  // columns + voice_note blocks via the T4 seam.
  const mergedWords = mergeRuleWords(
    rules,
    config.forbidden_words ?? [],
    config.required_phrases ?? [],
  );
  const configForRewrite = {
    ...config,
    forbidden_words: mergedWords.forbidden,
    required_phrases: mergedWords.required,
  };
  const extraContext = renderVoiceNoteBlocks(rules);

  // Two independent calls, concurrent (D1). allSettled so one failing never
  // rejects the other — the partial-success contract is in buildRefineResult.
  const [rwSettled, exSettled] = await Promise.allSettled([
    refineRewrite(
      configForRewrite,
      brand.primary_language,
      original,
      instruction,
      { extraContext },
    ),
    extractRule(original, instruction, {
      industry: brand.industry,
      language: brand.primary_language,
      existingRules: rules.map((r) => ({
        rule_type: r.rule_type,
        rule_text: r.rule_text,
        human_label: r.human_label,
      })),
    }),
  ]);

  const rewrite =
    rwSettled.status === "fulfilled"
      ? { ok: true, text: rwSettled.value.text }
      : { ok: false };
  const edit =
    exSettled.status === "fulfilled" && exSettled.value.ok
      ? exSettled.value.edit
      : null;

  const result = buildRefineResult({
    originalPost: original,
    rewrite,
    edit,
  });
  return Response.json(result.body, { status: result.status });
}
