"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ApplyRuleSchema,
  ACTIVE_RULE_CAP,
  findRuleConflict,
  type ApplyRule,
} from "@/lib/brand-rules/rule-validation";

const MAX_CONTENT_LEN = 5000;

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updatePostContent(
  postId: string,
  text: string,
): Promise<ActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Content cannot be empty" };
  if (trimmed.length > MAX_CONTENT_LEN) {
    return { ok: false, error: `Max ${MAX_CONTENT_LEN} characters` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: post } = await supabase
    .from("posts")
    .select("id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post not found" };
  if (post.status === "published") {
    return { ok: false, error: "Cannot edit a published post" };
  }

  const { error } = await supabase
    .from("posts")
    .update({
      content_text: trimmed,
      detection_score: null,
      detection_breakdown: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/posts");
  return { ok: true };
}

// Editorial Memory (T7) — "Apply & teach brand": save the reviewed rule AND
// (optionally) update the post to the reviewed rewrite, in one user action.
//
// Order is RULE-FIRST on purpose: the durable teaching is the moat, so if the
// post update fails afterward (e.g. the post changed underneath), the rule is
// still saved and we report postUpdated:false rather than silently claiming both
// landed (design Apply atomicity, Codex #17). The "save rule only" path (no
// rewrite to apply) calls this with rewrittenText omitted.
export type ApplyRuleResult =
  | { ok: true; postUpdated: boolean }
  | { ok: false; error: string };

export async function applyBrandRule(input: {
  postId: string;
  rule: ApplyRule;
  rewrittenText?: string | null;
}): Promise<ApplyRuleResult> {
  const parsed = ApplyRuleSchema.safeParse(input.rule);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid rule",
    };
  }
  const rule = parsed.data;

  const rewritten =
    typeof input.rewrittenText === "string" && input.rewrittenText.trim()
      ? input.rewrittenText.trim()
      : null;
  if (rewritten && rewritten.length > MAX_CONTENT_LEN) {
    return { ok: false, error: `Max ${MAX_CONTENT_LEN} characters` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: post } = await supabase
    .from("posts")
    .select("id, brand_id, status")
    .eq("id", input.postId)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post not found" };

  // Beta gate (Codex P1): the refine route + brand page are beta-gated, but this
  // write path must repeat the gate — otherwise a non-beta user could call the
  // Server Action directly and inject active brand_rules that the (ungated)
  // generation seam then honors for every future draft.
  const { data: brandGate } = await supabase
    .from("brands")
    .select("accounts!inner(beta_access)")
    .eq("id", post.brand_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brandGate?.accounts?.beta_access) {
    return { ok: false, error: "noBetaAccess" };
  }

  // Stale/published guard (C2): only blocks the post REWRITE; a rule sourced from
  // a published post is still valid memory.
  if (rewritten && post.status === "published") {
    return { ok: false, error: "This post is published — refresh and start over" };
  }

  // Active rules for cap + conflict (RLS owner-scoped to this brand).
  const { data: activeRows, error: activeErr } = await supabase
    .from("brand_rules")
    .select("rule_type, rule_text, human_label")
    .eq("brand_id", post.brand_id)
    .eq("active", true);
  if (activeErr) return { ok: false, error: activeErr.message };
  const active = activeRows ?? [];

  // NOTE (Codex P2, deferred): cap + conflict are checked here in app code, not
  // atomically with the insert. Two concurrent Apply calls for the same brand
  // could both pass and both insert, briefly exceeding the cap or adding a
  // forbidden↔required contradiction. Accepted for v1 (single-user dogfood). The
  // real fix — a transactional RPC or a DB constraint — lands with the store-
  // unification PR (TODO #24 / migration B).
  if (active.length >= ACTIVE_RULE_CAP) {
    return {
      ok: false,
      error: `You're at ${ACTIVE_RULE_CAP} active rules — deactivate one first`,
    };
  }
  const conflict = findRuleConflict(rule, active);
  if (conflict) {
    return {
      ok: false,
      error: `Conflicts with an existing rule: "${conflict.human_label ?? conflict.rule_text}"`,
    };
  }

  const { error: insErr } = await supabase.from("brand_rules").insert({
    brand_id: post.brand_id,
    rule_type: rule.rule_type,
    scope: rule.scope,
    rule_text: rule.rule_text,
    human_label: rule.human_label,
    rationale: rule.rationale ?? null,
    source_post_id: post.id,
    active: true,
  });
  if (insErr) return { ok: false, error: insErr.message };

  let postUpdated = false;
  if (rewritten) {
    // Stale/published guard (Codex P1): filter on status AND check a row was
    // actually updated. If the post was published or changed between the read
    // above and here, 0 rows update → report the honest partial (rule saved,
    // post not updated) instead of silently overwriting a published post.
    const { data: updRows, error: updErr } = await supabase
      .from("posts")
      .update({
        content_text: rewritten,
        detection_score: null,
        detection_breakdown: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .neq("status", "published")
      .select("id");
    if (updErr || !updRows || updRows.length === 0) {
      // Rule saved, post not updated — honest partial state, no silent success.
      revalidatePath(`/posts/${post.id}`);
      revalidatePath(`/brands/${post.brand_id}`);
      return { ok: true, postUpdated: false };
    }
    postUpdated = true;
  }

  revalidatePath(`/posts/${post.id}`);
  revalidatePath("/posts");
  revalidatePath(`/brands/${post.brand_id}`);
  return { ok: true, postUpdated };
}

export type BulkDeleteResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function bulkDeletePosts(
  postIds: string[],
): Promise<BulkDeleteResult> {
  if (postIds.length === 0) return { ok: true, deleted: 0 };
  if (postIds.length > 200) {
    return { ok: false, error: "Too many posts in one batch (max 200)" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS filters to user's brands. Status filter prevents accidental published delete.
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .in("id", postIds)
    .neq("status", "published")
    .select("id");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/posts");
  return { ok: true, deleted: data?.length ?? 0 };
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: post } = await supabase
    .from("posts")
    .select("id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post not found" };
  if (post.status === "published") {
    return { ok: false, error: "Cannot delete a published post" };
  }

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/posts");
  return { ok: true };
}

