import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { adapters, type PublishablePost, type PublishOutcome } from "@/lib/publishers";
import { publishToLinkedIn } from "@/lib/publishers/linkedin";
import {
  applyPrimaryUrl,
  pickBlogUrl,
  type Variant,
} from "@/lib/kitchen/resolve-placeholders";
import { activeBlogDomainForBrandStrict } from "@/lib/blog-domain";

// POST /api/posts/[id]/publish
//
// Platform-agnostic publish DISPATCHER. Routes a post to the right adapter by
// post.platform:
//   linkedin  → publishToLinkedIn (extracted, unchanged behavior)
//   hosted    → hostedAdapter      (Sepio-hosted blog /p/{brandId}/{slug} — universal fallback)
//   wordpress → wordPressAdapter   (WP REST + Application Password from Vault)
// All outcomes are audited in publish_attempts (best-effort). On success the
// posts row is updated (status/external_post_id/external_post_url/published_at).
// See wiki/architecture/posting-pipeline.md

const ParamsSchema = z.object({ id: z.string().uuid() });

type ErrorBody = { error: string; needsReconnect?: boolean; needsConnect?: boolean };
function jsonError(body: ErrorBody, status: number): Response {
  return NextResponse.json(body, { status });
}

// Local row type: posts.title/slug/excerpt/cover_image_alt were added in
// migration 20260609120000; database.types.ts regen is pending, so we read
// the row through an untyped client and shape it here.
// TODO: regen database.types.ts, then drop the cast + local type.
interface PostRow {
  id: string;
  brand_id: string;
  platform: string;
  language: string;
  status: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  content_text: string | null;
  content_markdown: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  content_group_id: string | null;
}

// Release a claimed post back to 'failed'. Captures the supabase error (which
// is not thrown) and logs loudly — if this fails the post is stranded in
// 'publishing', a visible degraded state we want surfaced, not swallowed.
async function markFailed(service: SupabaseClient, postId: string): Promise<void> {
  try {
    const { error } = await service.from("posts").update({ status: "failed" }).eq("id", postId);
    if (error) {
      console.error(`Could not reset post ${postId} to 'failed' (stuck 'publishing'):`, error.message);
    }
  } catch (err) {
    console.error(`Reset of post ${postId} to 'failed' threw (stuck 'publishing'):`, err);
  }
}

async function logPublishAttempt(
  service: SupabaseClient,
  p: {
    post_id: string;
    brand_id: string;
    platform: string;
    oauth_token_id: string | null;
    outcome: PublishOutcome;
  },
): Promise<void> {
  // Audit is non-critical: never fail the publish on a logging error.
  try {
    const { error } = await service.from("publish_attempts").upsert(
      {
        post_id: p.post_id,
        brand_id: p.brand_id,
        platform: p.platform,
        oauth_token_id: p.oauth_token_id ?? null,
        connection_id: null,
        status: p.outcome.ok ? "success" : "failed",
        error_message: p.outcome.ok ? null : p.outcome.message,
        external_post_id: p.outcome.ok ? p.outcome.externalId : null,
        succeeded_at: p.outcome.ok ? new Date().toISOString() : null,
      },
      { onConflict: "post_id,platform,connection_id,oauth_token_id" },
    );
    // supabase-js does not throw on DB errors — capture it explicitly.
    if (error) console.error("publish_attempts log failed:", error.message);
  } catch (err) {
    console.error("publish_attempts log threw:", err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rawParams = await context.params;
  const parsed = ParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return jsonError({ error: "Invalid post id" }, 400);
  }
  const postId = parsed.data.id;

  // 1. Auth + post (RLS-scoped). Untyped handle to read newly-added columns.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError({ error: "Not signed in" }, 401);

  const db = supabase as unknown as SupabaseClient;
  const { data: postData } = await db
    .from("posts")
    .select(
      "id, brand_id, platform, language, status, title, slug, excerpt, content_text, content_markdown, cover_image_url, cover_image_alt, content_group_id",
    )
    .eq("id", postId)
    .maybeSingle();
  const post = postData as PostRow | null;
  if (!post) return jsonError({ error: "Post not found" }, 404);
  if (post.status === "published") {
    return jsonError({ error: "Post already published" }, 409);
  }

  const publishable: PublishablePost = {
    id: post.id,
    brand_id: post.brand_id,
    platform: post.platform,
    language: post.language,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content_text: post.content_text,
    content_markdown: post.content_markdown,
    cover_image_url: post.cover_image_url,
    cover_image_alt: post.cover_image_alt,
  };

  // 2. Resolve the destination + credentials BEFORE claiming. Early returns
  //    here must not leave the post stuck in 'publishing'.
  const service = createServiceRoleClient();
  let oauthTokenId: string | null = null;
  let wpVaultSecretId: string | null = null;

  if (post.platform === "linkedin") {
    if (!post.content_text || !post.content_text.trim()) {
      return jsonError({ error: "Post content is empty" }, 400);
    }
  } else if (post.platform === "hosted") {
    // Blog publishes ONLY to a connected custom domain. No active domain →
    // refuse here (before claim) with a connect prompt. The hostedAdapter
    // enforces the same invariant as the real lock; this is the fast, friendly
    // path. A resolver/RPC failure must surface as 500 (strict), NOT collapse
    // into "connect a domain" (the brand may already have one).
    let blogDomain: string | null;
    try {
      blogDomain = await activeBlogDomainForBrandStrict(post.brand_id);
    } catch (err) {
      console.error("blog domain resolve failed:", err);
      return jsonError({ error: "Could not verify your blog domain. Try again." }, 500);
    }
    if (!blogDomain) {
      return jsonError(
        {
          error: "Connect a custom domain to your brand to publish the blog.",
          needsConnect: true,
        },
        400,
      );
    }
  } else if (post.platform === "wordpress") {
    const { data: wp } = await service
      .from("brand_oauth_tokens")
      .select("id, vault_secret_id, status")
      .eq("brand_id", post.brand_id)
      .eq("platform", "wordpress")
      .maybeSingle();
    if (!wp || !wp.vault_secret_id) {
      return jsonError(
        { error: "WordPress is not connected for this brand", needsReconnect: true },
        400,
      );
    }
    if (wp.status !== "active") {
      return jsonError(
        { error: `WordPress connection status is ${wp.status}`, needsReconnect: true },
        400,
      );
    }
    oauthTokenId = wp.id;
    wpVaultSecretId = wp.vault_secret_id;
  } else {
    return jsonError({ error: `Platform ${post.platform} not yet supported` }, 400);
  }

  // 2.5 Cross-link resolution (Content Kitchen). A social variant's body may embed
  //     the literal {{PRIMARY_URL}} token pointing back at the fuller blog article.
  //     Channels publish independently (no blog-first ordering): if a blog article
  //     for this group is published, substitute its URL; otherwise strip the token.
  //     The link only ever points at the BLOG (pickBlogUrl), never another social
  //     channel. Done for EVERY non-hosted post — even without a content_group —
  //     so a stray {{PRIMARY_URL}} never publishes literally. BEFORE the claim.
  let resolvedText = post.content_text;
  let resolvedPublishable = publishable;
  if (post.platform !== "hosted") {
    let siblings: Variant[] = [];
    if (post.content_group_id) {
      const { data: sibRaw } = await db
        .from("posts")
        .select("platform, status, external_post_url")
        .eq("content_group_id", post.content_group_id);
      siblings = (sibRaw ?? []) as Variant[];
    }

    const appOrigin = new URL(request.url).origin;
    const blogUrl = pickBlogUrl(siblings, appOrigin);
    resolvedText =
      post.content_text !== null ? applyPrimaryUrl(post.content_text, blogUrl) : null;
    resolvedPublishable = {
      ...publishable,
      content_text:
        publishable.content_text !== null
          ? applyPrimaryUrl(publishable.content_text, blogUrl)
          : null,
      content_markdown:
        publishable.content_markdown !== null
          ? applyPrimaryUrl(publishable.content_markdown, blogUrl)
          : null,
    };

    // Re-check non-empty AFTER stripping: a body that was only {{PRIMARY_URL}}
    // passes the pre-resolution empty check but is empty once the token is gone.
    if (resolvedText === null || !resolvedText.trim()) {
      return jsonError({ error: "Post content is empty" }, 400);
    }
  }

  // 3. Atomically CLAIM the post for publishing — prevents double-publish when
  //    two requests race. Only one update will match status<>published/publishing.
  const { data: claimed } = await db
    .from("posts")
    .update({ status: "publishing" })
    .eq("id", post.id)
    .not("status", "in", '("published","publishing")')
    .select("id");
  if (!claimed || (claimed as unknown[]).length === 0) {
    return jsonError({ error: "Post is already published or publishing" }, 409);
  }

  // 4. Publish via the resolved destination. Any throw must release the claim
  //    ('publishing' → 'failed'), never strand the post.
  let outcome: PublishOutcome;
  try {
    if (post.platform === "linkedin") {
      const result = await publishToLinkedIn({
        brandId: post.brand_id,
        contentText: resolvedText as string,
      });
      outcome = result.outcome;
      oauthTokenId = result.oauthTokenId;
    } else if (post.platform === "hosted") {
      outcome = await adapters.hosted.publish({
        post: resolvedPublishable,
        brandId: post.brand_id,
        config: {},
      });
    } else {
      outcome = await adapters.wordpress.publish({
        post: resolvedPublishable,
        brandId: post.brand_id,
        config: { vaultSecretId: wpVaultSecretId },
      });
    }
  } catch (err) {
    console.error("publish dispatch threw:", err);
    await markFailed(service, post.id);
    return jsonError({ error: "Publish failed unexpectedly" }, 500);
  }

  // 5. Audit (best-effort) + handle failure (release the claim → 'failed')
  await logPublishAttempt(service, {
    post_id: post.id,
    brand_id: post.brand_id,
    platform: post.platform,
    oauth_token_id: oauthTokenId,
    outcome,
  });

  if (!outcome.ok) {
    await markFailed(service, post.id);
    return jsonError(
      { error: outcome.message, needsReconnect: outcome.needsReconnect },
      outcome.status || 502,
    );
  }

  // 6. Mark published (service-role: avoids RLS/transient flakiness leaving the
  //    post stranded in 'publishing' after it's already live on the destination).
  const publishedAt = new Date().toISOString();
  // Cast to the untyped client (file idiom, see `db` above) — database.types.ts
  // doesn't yet carry variant_state, so the typed Update rejects it.
  const { error: updateErr } = await (service as unknown as SupabaseClient)
    .from("posts")
    .update({
      status: "published",
      // Keep variant_state in lockstep so the kitchen reconstructs the published
      // lock after a reload (page.tsx hydrates variant state from variant_state,
      // not posts.status). Harmless for hosted/wordpress.
      variant_state: "published",
      external_post_id: outcome.externalId,
      external_post_url: outcome.externalUrl,
      published_at: publishedAt,
    })
    .eq("id", post.id);
  if (updateErr) {
    // Published on the destination but DB update failed — content is LIVE, so we
    // do not revert; log loudly and still return success (avoids double-post).
    console.error(
      `Post ${post.id} published to ${post.platform} but status update failed (stuck 'publishing'):`,
      updateErr.message,
    );
  }

  return NextResponse.json({
    success: true,
    // Back-compat keys for the existing LinkedIn publish UI:
    urn: outcome.externalId,
    url: outcome.externalUrl,
    external_id: outcome.externalId,
    published_at: publishedAt,
  });
}
