// POST /api/posts/[id]/variants — Content Kitchen fan-out (one source → N channels).
//
// Given a post [id], generate (or return a cached) channel-native VARIANT for a
// target platform. The blog/hosted post is the SOURCE; every social channel is a
// variant adapted from it, in the brand voice + differentiation (same moat as the
// generate route). Variants share a content_group so the group can be re-fanned
// when the source is re-edited (source_version bump → variants go stale).
//
// Direct route (heavy synchronous LLM call returning data to the client) — same
// precedent as the refine route; auth is the session cookie.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateVariantFromSource, ClaudeError } from "@/lib/claude";
import {
  isChannelId,
  DEFAULT_FORMAT_BY_CHANNEL,
  type ChannelId,
} from "@/lib/kitchen/channel-formats";
import { getPostBody, bodyUpdateForPlatform } from "@/lib/post-body";
import { assembleMoatContext } from "@/lib/moat-context";
import {
  buildAllowedNumbers,
  buildNumbersRevisionNote,
  configNumberSources,
  findUngroundedNumbers,
} from "@/lib/_private/grounded-numbers";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60; // a single LLM call (short-form), but Sonnet headroom.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The blog IS the source, not a variant — reject 'hosted' explicitly (zod's
// refine carries the user-facing message). Any other valid ChannelId is allowed.
export const RequestSchema = z.object({
  platform: z
    .string()
    .refine(isChannelId, "Unknown platform")
    .refine((p) => p !== "hosted", "the blog is the source, not a variant"),
  force: z.boolean().optional(),
});

// variant_state values that mean "a usable variant already exists" — a freshly
// synced/edited/published child can be reused; 'source' is the blog itself and
// 'stale' must be regenerated.
type VariantState = "source" | "synced" | "stale" | "edited" | "published";
type ChildVariant = {
  generated_from_source_version: number | null;
  variant_state: string | null;
};

// Pure cache decision (extracted for unit tests). A child variant is FRESH —
// returnable unchanged — when it exists, force was not requested, it was
// generated from the group's current source_version, and its state is one of the
// "real content" states (not 'source'/'stale'). Anything else → regenerate.
export function isVariantFresh(
  child: ChildVariant | null | undefined,
  groupSourceVersion: number,
  force?: boolean,
): boolean {
  if (!child || force === true) return false;
  if (child.generated_from_source_version !== groupSourceVersion) return false;
  const usable: ReadonlySet<VariantState> = new Set<VariantState>([
    "synced",
    "edited",
    "published",
  ]);
  return usable.has(child.variant_state as VariantState);
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

// Minimal row shapes read through the untyped `db` client (see POST below) past
// the lagging database.types (T-types): content_groups isn't in the generated
// types at all, and posts lacks the kitchen columns.
type SourcePostRow = {
  id: string;
  brand_id: string;
  platform: string;
  language: string;
  status: string;
  content_text: string | null;
  content_markdown: string | null;
  source_post_id: string | null;
  content_group_id: string | null;
};
type ContentGroupRow = { id: string; source_version: number };
type ChildPostRow = ChildVariant & {
  id: string;
  content_text: string | null;
  content_markdown: string | null;
  // W2 receipt snapshot persisted at generation (jsonb; null = not tracked).
  // Fast-paths return the PERSISTED value so a cached variant keeps its receipt.
  applied_rules: unknown;
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: postId } = await ctx.params;
  if (!UUID.test(postId)) return jsonError("Invalid post id", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Not signed in", 401);

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }
  const platform = parsed.data.platform as ChannelId;
  const force = parsed.data.force;

  const db = supabase;

  // The requested post (RLS owner read).
  const { data: postRaw } = await db
    .from("posts")
    .select(
      "id, brand_id, platform, language, status, content_text, content_markdown, source_post_id, content_group_id",
    )
    .eq("id", postId)
    .maybeSingle();
  const post = postRaw as SourcePostRow | null;
  if (!post) return jsonError("Post not found", 404);

  // Resolve the SOURCE: a post with no source_post_id IS the source (the blog);
  // otherwise the named source is the canonical article we adapt from.
  let source: SourcePostRow = post;
  if (post.source_post_id) {
    const { data: srcRaw } = await db
      .from("posts")
      .select(
        "id, brand_id, platform, language, status, content_text, content_markdown, source_post_id, content_group_id",
      )
      .eq("id", post.source_post_id)
      .maybeSingle();
    const src = srcRaw as SourcePostRow | null;
    if (!src) return jsonError("Source post not found", 404);
    source = src;
  }

  // Beta gate — the social fan-out is dogfood-locked like Editorial Memory /
  // Market Brain (refine/route.ts:80). The blog itself (Track B) stays ungated;
  // only adapting it into channel variants is beta. A brand whose account lacks
  // beta_access can't reach here. The UI hides the social rows for the same set,
  // so this is the server half of a defence-in-depth pair.
  const { data: gate, error: gateErr } = await supabase
    .from("brands")
    .select("id, accounts!inner(beta_access)")
    .eq("id", source.brand_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (gateErr) return jsonError(gateErr.message, 500);
  if (!gate) return jsonError("Brand not found", 404);
  if (!gate.accounts.beta_access) return jsonError("noBetaAccess", 403);

  const sourceBody = getPostBody(source);
  if (!sourceBody.trim()) {
    return jsonError("Source post has no content to adapt", 400);
  }

  // A variant can't be on the SAME platform as its source — otherwise the child
  // lookup below could resolve to the source row itself and the regenerate branch
  // would overwrite the canonical source body. Latent while the source is always
  // 'hosted' (the requested platform is never 'hosted'), but guard it explicitly.
  if (platform === source.platform) {
    return jsonError("Cannot create a variant on the source's own platform", 400);
  }

  // Ensure the source belongs to a content_group. If not, create one and mark the
  // source post as the group's 'source' at version 1. The group's source_version
  // is the freshness key the variants are generated against.
  let groupId: string;
  let groupVersion: number;
  if (source.content_group_id) {
    const { data: grpRaw, error: grpErr } = await db
      .from("content_groups")
      .select("id, source_version")
      .eq("id", source.content_group_id)
      .maybeSingle();
    if (grpErr) return jsonError(grpErr.message, 500);
    const grp = grpRaw as ContentGroupRow | null;
    if (!grp) return jsonError("Content group not found", 404);
    groupId = grp.id;
    groupVersion = grp.source_version;
  } else {
    const { data: grpRaw, error: grpErr } = await db
      .from("content_groups")
      .insert({
        brand_id: source.brand_id,
        source_version: 1,
        selected_platforms: ["hosted"],
      })
      .select("id, source_version")
      .single();
    if (grpErr || !grpRaw) {
      return jsonError(grpErr?.message ?? "Failed to create content group", 500);
    }
    const grp = grpRaw as ContentGroupRow;
    groupId = grp.id;
    groupVersion = grp.source_version;

    const { error: updErr } = await db
      .from("posts")
      .update({
        content_group_id: groupId,
        variant_state: "source",
        generated_from_source_version: 1,
      })
      .eq("id", source.id);
    if (updErr) return jsonError(updErr.message, 500);
  }

  // Existing child variant for this (group, platform) — the unique index enforces
  // at most one. CACHE: a fresh, usable child is returned unchanged.
  const { data: childRaw } = await db
    .from("posts")
    .select(
      "id, content_text, content_markdown, variant_state, generated_from_source_version, applied_rules",
    )
    .eq("content_group_id", groupId)
    .eq("platform", platform)
    .neq("id", source.id) // never match the source row itself (R-07)
    .maybeSingle();
  const existingChild = childRaw as ChildPostRow | null;

  if (existingChild && isVariantFresh(existingChild, groupVersion, force)) {
    return Response.json({
      post_id: existingChild.id,
      content_group_id: groupId,
      platform,
      variant_state: existingChild.variant_state,
      generated_from_source_version: existingChild.generated_from_source_version,
      content_text: existingChild.content_text,
      content_markdown: existingChild.content_markdown,
      applied_rules: existingChild.applied_rules ?? null,
    });
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  // Same moat assembly as the generate route, via the shared assembleMoatContext
  // helper (Market Brain + Client Brain + Editorial Memory) — no more copy-paste
  // drift (this route previously dropped Client Brain facts).
  // These reads are independent (all keyed on source.brand_id) — run them
  // concurrently to save round-trips before the LLM call (R-09).
  const [configRes, diffRes, rulesRes, proofRes] = await Promise.all([
    supabase.from("brand_configs").select("*").eq("brand_id", source.brand_id).maybeSingle(),
    supabase
      .from("market_differentiation")
      .select("common_themes, positioning_gaps")
      .eq("brand_id", source.brand_id)
      .maybeSingle(),
    supabase
      .from("brand_rules")
      // id/human_label feed the W2 applied-rules receipt; the sort order stays
      // (created_at, id) — a byte-stable prompt-assembly invariant (cache).
      .select("id, rule_type, scope, rule_text, human_label")
      .eq("brand_id", source.brand_id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("proof_items")
      .select("kind, body, source, verifiable")
      .eq("brand_id", source.brand_id)
      // Stable order — the block is a prompt-cache key; unordered rows churn it.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const config = configRes.data;
  if (!config) return jsonError("Brand config missing", 500);

  const { data: diffRow, error: diffErr } = diffRes;
  if (diffErr) {
    console.error("market_differentiation read failed:", diffErr.message);
  }

  const { data: ruleRows, error: rulesErr } = rulesRes;
  if (rulesErr) {
    console.error("brand_rules read failed:", rulesErr.message);
  }

  const { data: proofRows, error: proofErr } = proofRes;
  if (proofErr) {
    console.error("proof_items read failed:", proofErr.message);
  }

  const rules = rulesErr ? [] : (ruleRows ?? []);
  const { configForGen, extraContext, appliedRules } = assembleMoatContext({
    config,
    diffRow: diffErr ? null : diffRow,
    rules,
    proofRows: proofErr ? [] : (proofRows ?? []),
  });
  // W2 receipt snapshot. null ≠ []: a rules read error persists null ("not
  // tracked" — no receipt), a clean zero-rule read persists [] (honest CTA).
  const appliedRulesSnapshot = rulesErr ? null : appliedRules;
  const appliedRulesJson = appliedRulesSnapshot as unknown as Json;

  const variantFormat = DEFAULT_FORMAT_BY_CHANNEL[platform];
  let generated;
  try {
    generated = await generateVariantFromSource(
      configForGen,
      source.language,
      sourceBody,
      variantFormat,
      { extraContext },
    );
  } catch (err) {
    // Provider (Anthropic) errors can carry billing/quota internals that must
    // not reach an end user — log the real error, return a generic message.
    if (err instanceof ClaudeError) {
      console.error("[variants] Claude generation failed:", err.status, err.message);
    } else {
      console.error("[variants] variant generation failed:", err);
    }
    const status = err instanceof ClaudeError && err.status === 401 ? 500 : 502;
    return jsonError(
      "AI generation is temporarily unavailable. Please try again in a moment.",
      status,
    );
  }

  // Grounded-numbers gate (T-ground PR1): the source article's figures passed
  // the blog fact-validator, but the adapter can still ADD its own. Violation →
  // ONE regenerate with feedback (cache-safe, user message); still dirty (or
  // regen failed) → save anyway (fail-open, human gate) + surface the list.
  let ungroundedNumbers: string[] = [];
  try {
    const allowedNumbers = buildAllowedNumbers([
      sourceBody,
      ...extraContext,
      ...(proofErr ? [] : (proofRows ?? [])).map((p) => p.body),
      ...configNumberSources(configForGen),
    ]);
    const violations = findUngroundedNumbers(generated.text, allowedNumbers);
    if (violations.length > 0) {
      try {
        const second = await generateVariantFromSource(
          configForGen,
          source.language,
          sourceBody,
          variantFormat,
          { extraContext, revisionNote: buildNumbersRevisionNote(violations) },
        );
        generated = second;
        ungroundedNumbers = findUngroundedNumbers(
          second.text,
          allowedNumbers,
        ).map((v) => v.raw);
      } catch (err) {
        console.error(
          "[variants] grounded-numbers regen failed:",
          err instanceof Error ? err.message : err,
        );
        ungroundedNumbers = violations.map((v) => v.raw);
      }
    }
  } catch (err) {
    console.error(
      "[variants] grounded-numbers check failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Upsert the child. 'hosted' is excluded above, so bodyUpdateForPlatform always
  // routes the body to content_text here. On an existing row this is a regenerate
  // (update in place, keyed by the unique (content_group_id, platform) index).
  const bodyPatch = bodyUpdateForPlatform(platform, generated.text);
  let childId: string;
  if (existingChild) {
    // Regenerate-in-place: the receipt snapshot must move WITH the new text —
    // otherwise the body reflects this generation while the receipt still
    // describes the previous one (Codex).
    const { error: updErr } = await db
      .from("posts")
      .update({
        ...bodyPatch,
        variant_state: "synced",
        generated_from_source_version: groupVersion,
        applied_rules: appliedRulesJson,
      })
      .eq("id", existingChild.id);
    if (updErr) return jsonError(updErr.message, 500);
    childId = existingChild.id;
  } else {
    const { data: inserted, error: insErr } = await db
      .from("posts")
      .insert({
        brand_id: source.brand_id,
        platform,
        language: source.language,
        content_group_id: groupId,
        source_post_id: source.id,
        variant_state: "synced",
        generated_from_source_version: groupVersion,
        status: "draft",
        source_type: "manual",
        applied_rules: appliedRulesJson,
        ...bodyPatch,
      })
      .select("id")
      .single();
    if (insErr) {
      // Race recovery: a concurrent request for the same (group, platform) won
      // the insert first and tripped the partial unique index
      // posts_one_variant_per_group_platform_idx. Return the row that now exists
      // (RLS-scoped) instead of surfacing a 500 — both requests generated from
      // the same source, so the winner's variant is equivalent.
      if (insErr.code === "23505") {
        const { data: raceRaw } = await db
          .from("posts")
          .select(
            "id, content_text, content_markdown, variant_state, generated_from_source_version, applied_rules",
          )
          .eq("content_group_id", groupId)
          .eq("platform", platform)
          .neq("id", source.id) // never match the source row itself (R-07)
          .maybeSingle();
        const raced = raceRaw as ChildPostRow | null;
        if (raced) {
          return Response.json({
            post_id: raced.id,
            content_group_id: groupId,
            platform,
            variant_state: raced.variant_state ?? "synced",
            generated_from_source_version: raced.generated_from_source_version,
            content_text: raced.content_text,
            content_markdown: raced.content_markdown,
            applied_rules: raced.applied_rules ?? null,
          });
        }
      }
      return jsonError(insErr.message ?? "Failed to save variant", 500);
    }
    if (!inserted) return jsonError("Failed to save variant", 500);
    childId = (inserted as { id: string }).id;
  }

  return Response.json({
    post_id: childId,
    content_group_id: groupId,
    platform,
    variant_state: "synced",
    generated_from_source_version: groupVersion,
    content_text: bodyPatch.content_text ?? null,
    content_markdown: bodyPatch.content_markdown ?? null,
    // [] = checked clean; non-empty = figures that survived the regen pass.
    // The 23505 race-recovery response above omits the field (unknown for the
    // winner's generation) — the client treats undefined as "no warning".
    ungrounded_numbers: ungroundedNumbers,
    applied_rules: appliedRulesSnapshot,
  });
}
