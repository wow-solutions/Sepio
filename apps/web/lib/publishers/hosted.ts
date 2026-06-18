// Hosted publisher — the UNIVERSAL FALLBACK destination (platform 'hosted').
//
// Publishes a generated article to the per-brand blog we host ourselves at
// /p/{brandId}/{slug}, backed by the brand_blog_posts table (migration
// 20260609120000). Works for ANY site without code/key/DNS access, so it is
// the safe default when no first-class integration (LinkedIn, WordPress, …)
// is available.
//
// Idempotent: upserts on the table's unique (brand_id, slug, locale), so a
// re-publish updates the existing row in place rather than erroring.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "@/lib/slug";
import type { PublishAdapter, PublishContext, PublishOutcome } from "./types";

// Public render route is locale-prefixed (app/[locale]/p/[brandId]/[slug]).
// pt/fr posts have no app route yet (known gap) — render currently covers en/es/ru.
function url(brandId: string, slug: string, locale: string): string {
  return `/${locale}/p/${brandId}/${slug}`;
}

export const hostedAdapter: PublishAdapter = {
  platform: "hosted",

  async publish(ctx: PublishContext): Promise<PublishOutcome> {
    const { post, brandId } = ctx;

    // title is NOT NULL on brand_blog_posts — refuse early with a clear error.
    if (!post.title || !post.title.trim()) {
      return {
        ok: false,
        status: 400,
        message: "Article title required for blog publish",
      };
    }
    const title = post.title.trim();

    const baseSlug = post.slug && post.slug.trim() ? post.slug.trim() : slugify(title);
    if (!baseSlug) {
      return {
        ok: false,
        status: 400,
        message: "Could not derive a slug from the article title",
      };
    }

    const bodyMarkdown = post.content_markdown ?? post.content_text;
    // Refuse to publish an empty article — mirrors the LinkedIn empty-body guard
    // in the publish route. Without this we'd push a live blog page with no body.
    if (!bodyMarkdown || !bodyMarkdown.trim()) {
      return {
        ok: false,
        status: 400,
        message: "Article body is empty",
      };
    }

    // Service-role write: this is a server-side publish that bypasses the
    // user-scoped RLS path. brand_blog_posts is owner-scoped + public-read.
    const service = createServiceRoleClient();

    // TODO: regen database.types.ts — brand_blog_posts isn't in the generated
    // Database types yet (migration 20260609120000 lags the types), so the
    // table name and row shape aren't known to the typed query builder. Cast
    // the builder to escape the typed-table union for these queries.
    const table = () =>
      (service.from as (name: string) => ReturnType<typeof service.from>)("brand_blog_posts");

    const row = (slug: string) => ({
      brand_id: brandId,
      source_post_id: post.id,
      slug,
      locale: post.language,
      title,
      excerpt: post.excerpt,
      body_markdown: bodyMarkdown,
      cover_image_url: post.cover_image_url,
      cover_image_alt: post.cover_image_alt,
      status: "published",
      published_at: new Date().toISOString(),
    });

    // Slug allocation, race-safe (insert-first, never clobber a DIFFERENT post):
    //   - INSERT with the base slug. Success → done.
    //   - On unique violation (23505) read who owns (brand_id, slug, locale):
    //       same source_post_id → re-publish: UPDATE that row in place.
    //       different source     → suffix the slug with a stable shard of THIS
    //                              post's id and retry once (reserve room so the
    //                              suffix is never truncated by the 120-cap).
    const SUFFIX = `-${post.id.slice(0, 8)}`;
    const baseCapped = baseSlug.slice(0, 120);
    const suffixedSlug = `${baseSlug.slice(0, 120 - SUFFIX.length)}${SUFFIX}`;
    const candidates = [baseCapped, suffixedSlug];

    for (let i = 0; i < candidates.length; i++) {
      const slug = candidates[i];
      const ins = await table().insert(row(slug)).select("id").single();
      if (!ins.error) {
        return { ok: true, externalId: (ins.data as { id: string }).id, externalUrl: url(brandId, slug, post.language) };
      }
      if ((ins.error as { code?: string }).code !== "23505") {
        return { ok: false, status: 500, message: ins.error.message };
      }
      // Conflict on this slug — who owns it?
      const { data: ex, error: exErr } = await table()
        .select("id, source_post_id")
        .eq("brand_id", brandId)
        .eq("slug", slug)
        .eq("locale", post.language)
        .maybeSingle();
      if (exErr) {
        return { ok: false, status: 500, message: exErr.message };
      }
      if (ex && (ex as { source_post_id: string | null }).source_post_id === post.id) {
        // Re-publish of the SAME post → update in place (idempotent).
        const upd = await table()
          .update(row(slug))
          .eq("id", (ex as { id: string }).id)
          .select("id")
          .single();
        if (upd.error) return { ok: false, status: 500, message: upd.error.message };
        return { ok: true, externalId: (upd.data as { id: string }).id, externalUrl: url(brandId, slug, post.language) };
      }
      // Owned by a different post → try the suffixed candidate next iteration.
    }
    return { ok: false, status: 409, message: "Could not allocate a unique blog slug" };
  },
};
