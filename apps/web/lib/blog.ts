import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// blog_posts is not yet in database.types.ts, so the typed client narrows
// .from() to the known-table union and rejects "blog_posts". Cast to an
// untyped client for blog queries only — surgical, no shared-file churn.
async function blogClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

// blog_posts is not yet in database.types.ts (types weren't regenerated after
// PR1). Declare minimal local row types and cast the query result to stay
// surgical — do not block PR2 on a global type regen.

export type BlogPostListRow = {
  slug: string;
  title: string;
  description: string | null;
  published_at: string | null;
  cover_image_url: string | null;
  author_name: string | null;
};

export type BlogPostRow = {
  slug: string;
  title: string;
  description: string | null;
  body: string;
  published_at: string | null;
  material_updated_at: string | null;
  author_name: string | null;
  author_slug: string | null;
  cover_image_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
};

export const BLOG_PER_PAGE = 20;

// Published posts, newest first, paginated. `page` is 1-based.
// Returns { posts, total } so the index can render pagination controls.
export async function listPublished(
  page = 1,
  perPage = BLOG_PER_PAGE,
): Promise<{ posts: BlogPostListRow[]; total: number }> {
  const supabase = await blogClient();
  const p = Math.max(1, page);
  const from = (p - 1) * perPage;

  const { data, count, error } = await supabase
    .from("blog_posts")
    .select(
      "slug, title, description, published_at, cover_image_url, author_name",
      { count: "exact" },
    )
    .eq("locale", "en") // content is en-only for now
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(from, from + perPage - 1)
    .returns<BlogPostListRow[]>();

  if (error) throw error;
  return { posts: data ?? [], total: count ?? 0 };
}

// Single published post by slug, or null (-> notFound()).
export async function getPublishedBySlug(
  slug: string,
): Promise<BlogPostRow | null> {
  const supabase = await blogClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(
      "slug, title, description, body, published_at, material_updated_at, author_name, author_slug, cover_image_url, og_title, og_description, og_image_url",
    )
    .eq("slug", slug)
    .eq("locale", "en")
    .eq("status", "published") // belt-and-suspenders over RLS
    .maybeSingle()
    .returns<BlogPostRow>();

  if (error) throw error;
  return data ?? null;
}
