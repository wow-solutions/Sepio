import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listBrandBlogPosts, getBrandName } from "@/lib/brand-blog";
import { activeBlogDomainForBrand } from "@/lib/blog-domain";
import { BlogShell } from "../../blog/shell";
import "../../blog/blog.css";

type Params = Promise<{ locale: string; brandId: string }>;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { brandId } = await params;
  // Gate first: /p/ index exists only as the noindex duplicate for own-domain
  // brands. No active domain → 404 (page body), so don't expose the title here.
  const blogDomain = await activeBlogDomainForBrand(brandId);
  if (!blogDomain) return {};
  const brandName = await getBrandName(brandId);
  const title = brandName ? `${brandName} — Blog` : "Blog";
  return {
    title,
    robots: { index: false, follow: true },
  };
}

export default async function BrandBlogIndexPage({
  params,
}: {
  params: Params;
}) {
  const { locale, brandId } = await params;
  setRequestLocale(locale as Locale); // next-intl static-render hook

  // No active domain → blog isn't connected → /p/ is not public. 404.
  const blogDomain = await activeBlogDomainForBrand(brandId);
  if (!blogDomain) notFound();

  const [posts, brandName] = await Promise.all([
    listBrandBlogPosts(brandId, locale),
    getBrandName(brandId), // null for anon visitors (brands has no anon RLS)
  ]);

  return (
    <BlogShell>
      <article className="blog-article">
        {brandName && <p className="ba-eyebrow">{brandName}</p>}
        <h1 className="ba-headline">Blog</h1>

        {posts.length === 0 ? (
          <p className="ba-standfirst">No posts published yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "2rem 0 0" }}>
            {posts.map((post) => {
              const date = formatDate(post.published_at);
              return (
                <li key={`${post.slug}:${post.locale}`} style={{ marginBottom: "1.5rem" }}>
                  <Link href={`/p/${brandId}/${post.slug}`}>
                    <b>{post.title}</b>
                  </Link>
                  {post.excerpt && (
                    <p style={{ margin: "0.25rem 0 0", opacity: 0.8 }}>
                      {post.excerpt}
                    </p>
                  )}
                  {date && (
                    <time
                      dateTime={post.published_at ?? undefined}
                      style={{ fontSize: "0.85rem", opacity: 0.6 }}
                    >
                      {date}
                    </time>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </BlogShell>
  );
}
