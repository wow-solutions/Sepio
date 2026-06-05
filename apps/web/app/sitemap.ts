import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localizedUrl, hreflangAlternates } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";

// Public, index-worthy pages only. Auth/authed/api routes are excluded here and
// disallowed in robots.ts. URLs follow localePrefix: "as-needed" (en unprefixed).
const PAGES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "pricing", changeFrequency: "weekly", priority: 0.8 },
  { path: "privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "terms", changeFrequency: "monthly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const staticEntries: MetadataRoute.Sitemap = PAGES.map(
    ({ path, changeFrequency, priority }) => ({
      url: localizedUrl("en", path),
      lastModified,
      changeFrequency,
      priority,
      alternates: hreflangAlternates(path),
    }),
  );

  // Blog index + published posts (en-only -> no hreflang alternates).
  // Cast to untyped client: blog_posts isn't in database.types.ts yet.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("blog_posts")
    .select("slug, published_at, material_updated_at, author_slug")
    .eq("status", "published")
    .eq("locale", "en")
    .order("published_at", { ascending: false })
    .returns<
      {
        slug: string;
        published_at: string | null;
        material_updated_at: string | null;
        author_slug: string | null;
      }[]
    >();

  const rows = data ?? [];

  const blogIndexEntry: MetadataRoute.Sitemap[number] = {
    url: localizedUrl("en", "blog"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.6,
  };

  const editorialPolicyEntry: MetadataRoute.Sitemap[number] = {
    url: localizedUrl("en", "blog/editorial-policy"),
    lastModified,
    changeFrequency: "yearly",
    priority: 0.3,
  };

  const postEntries: MetadataRoute.Sitemap = rows.map((p) => ({
    url: localizedUrl("en", `blog/${p.slug}`),
    lastModified: p.material_updated_at ?? p.published_at ?? lastModified,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // One entry per author who has at least one published post (E-E-A-T hubs).
  const authorSlugs = [
    ...new Set(rows.map((p) => p.author_slug).filter((s): s is string => !!s)),
  ];
  const authorEntries: MetadataRoute.Sitemap = authorSlugs.map((slug) => ({
    url: localizedUrl("en", `authors/${slug}`),
    lastModified,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [
    ...staticEntries,
    blogIndexEntry,
    editorialPolicyEntry,
    ...postEntries,
    ...authorEntries,
  ];
}
