import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// brand_blog_posts is not yet in database.types.ts (types weren't regenerated
// after migration 20260609120000). The typed client narrows .from() to the
// known-table union and rejects "brand_blog_posts" / "brands" shapes, so we
// cast to an untyped client for these queries only — surgical, mirrors the
// precedent in lib/blog.ts. Uses the public ANON Supabase client: the page is
// public and relies on the "anyone can read published brand blog posts" RLS
// policy, which only exposes status='published' rows.
// TODO: regen database.types.ts (brand_blog_posts, brands.* new columns).
async function brandBlogClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

// brandId comes from the URL path. A non-UUID value would make Postgres throw a
// 22P02 cast error (→ 500) instead of a clean notFound/empty. Guard up front.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export type BrandBlogPostRow = {
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  body_markdown: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export type BrandBlogPostListRow = {
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
};

const POST_COLUMNS =
  "slug, locale, title, excerpt, body_markdown, cover_image_url, cover_image_alt, published_at, updated_at";

// A single published article for a brand, keyed on (brand_id uuid, slug).
// Prefers the row matching `preferLocale`; if there is no published row in that
// locale, falls back to any published locale for the same (brand_id, slug)
// — published_at desc as a stable tiebreak. Returns null -> notFound().
export async function getBrandBlogPost(
  brandId: string,
  slug: string,
  preferLocale: string,
): Promise<BrandBlogPostRow | null> {
  if (!isUuid(brandId)) return null;
  const supabase = await brandBlogClient();

  const { data, error } = await supabase
    .from("brand_blog_posts")
    .select(POST_COLUMNS)
    .eq("brand_id", brandId)
    .eq("slug", slug)
    .eq("status", "published") // belt-and-suspenders over the anon RLS
    .order("published_at", { ascending: false })
    .returns<BrandBlogPostRow[]>();

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;

  return rows.find((r) => r.locale === preferLocale) ?? rows[0];
}

// Published posts for a brand in ONE locale, newest first. Locale-scoped so the
// index doesn't list rows whose links (rendered through the current [locale]
// path) would resolve to the wrong-locale article. Small N -> no pagination.
// Returns [] when there are none (or the id is unknown/invalid).
export async function listBrandBlogPosts(
  brandId: string,
  locale: string,
): Promise<BrandBlogPostListRow[]> {
  if (!isUuid(brandId)) return [];
  const supabase = await brandBlogClient();

  const { data, error } = await supabase
    .from("brand_blog_posts")
    .select("slug, locale, title, excerpt, published_at")
    .eq("brand_id", brandId)
    .eq("locale", locale)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .returns<BrandBlogPostListRow[]>();

  if (error) throw error;
  return data ?? [];
}

// Brand display name for an attribution line. brands has NO anon-read RLS
// (owner-only via account_id), so this returns null when called anonymously —
// callers must render gracefully without the name. Best-effort: any error /
// empty result -> null, never throws (a public page must not 500 on this).
export async function getBrandName(brandId: string): Promise<string | null> {
  try {
    const supabase = await brandBlogClient();
    const { data, error } = await supabase
      .from("brands")
      .select("name")
      .eq("id", brandId)
      .maybeSingle()
      .returns<{ name: string | null }>();

    if (error) return null;
    return data?.name ?? null;
  } catch {
    return null;
  }
}
