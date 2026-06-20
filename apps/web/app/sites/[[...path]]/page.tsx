import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { bareHost } from "@/lib/app-host";
import { resolveBlogDomain } from "@/lib/blog-domain";
import {
  parseSitesPath,
  blogPath,
  blogUrl,
  type SitesRoute,
} from "@/lib/blog-domain-routing";
import {
  getBrandBlogPost,
  listBrandBlogPosts,
  getBrandBlogPostLocales,
} from "@/lib/brand-blog";
import { BrandArticleView } from "@/components/blog/brand-article-view";
import { ClientBlogShell } from "@/components/blog/client-blog-shell";
// Shared editorial theme (.blog-article, .ba-*). Same stylesheet the Sepio
// /p/<brandId>/<slug> renderer uses.
import "../../[locale]/blog/blog.css";

type Params = Promise<{ path?: string[] }>;

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

// Resolve host + route once; shared by generateMetadata and the page.
async function resolveRequest(params: Params): Promise<
  | { ok: false }
  | {
      ok: true;
      host: string;
      brandId: string;
      brandName: string | null;
      primaryLocale: string;
      routeableLocales: Set<string>;
      route: SitesRoute;
    }
> {
  const { path } = await params;
  const host = bareHost((await headers()).get("host"));
  const domain = await resolveBlogDomain(host);
  if (!domain) return { ok: false };
  const route = parseSitesPath(path, domain.primaryLocale, domain.locales);
  return {
    ok: true,
    host,
    brandId: domain.brandId,
    brandName: domain.brandName,
    primaryLocale: domain.primaryLocale,
    routeableLocales: new Set([domain.primaryLocale, ...domain.locales]),
    route,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const r = await resolveRequest(params);
  if (!r.ok) return {};
  const route = r.route;
  if (route.kind === "notfound") return {};

  if (route.kind === "index") {
    return {
      title: r.brandName ? `${r.brandName} — Blog` : "Blog",
      alternates: {
        canonical: blogUrl(r.host, r.primaryLocale, route.locale),
      },
      robots: { index: true, follow: true },
    };
  }

  const post = await getBrandBlogPost(r.brandId, route.slug, route.locale);
  if (!post || post.locale !== route.locale) return {};

  const canonical = blogUrl(r.host, r.primaryLocale, route.locale, route.slug);
  const publishedLocales = await getBrandBlogPostLocales(r.brandId, route.slug);
  const languages: Record<string, string> = {};
  for (const loc of publishedLocales) {
    // Only emit hreflang for locales this domain actually serves — a published
    // row in a locale outside the brand's config would 404 at /<loc>/<slug>.
    if (!r.routeableLocales.has(loc)) continue;
    languages[loc] = blogUrl(r.host, r.primaryLocale, loc, route.slug);
  }
  languages["x-default"] = blogUrl(
    r.host,
    r.primaryLocale,
    r.primaryLocale,
    route.slug,
  );

  const img = post.cover_image_url ?? undefined;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical, languages },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      siteName: r.brandName ?? undefined,
      url: canonical,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? post.published_at ?? undefined,
      images: img ? [{ url: img, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt ?? undefined,
      images: img ? [img] : undefined,
    },
  };
}

export default async function ClientBlogPage({ params }: { params: Params }) {
  const r = await resolveRequest(params);
  if (!r.ok) notFound();
  const route = r.route;
  if (route.kind === "notfound") notFound();

  // ── Index (domain root, or /<locale> for an additional language)
  if (route.kind === "index") {
    const posts = await listBrandBlogPosts(r.brandId, route.locale);
    return (
      <ClientBlogShell brandName={r.brandName}>
        <article className="blog-article">
          {r.brandName && <p className="ba-eyebrow">{r.brandName}</p>}
          <h1 className="ba-headline">Blog</h1>
          {posts.length === 0 ? (
            <p className="ba-standfirst">No posts published yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "2rem 0 0" }}>
              {posts.map((post) => {
                const date = formatDate(post.published_at);
                return (
                  <li key={post.slug} style={{ marginBottom: "1.5rem" }}>
                    <a
                      href={blogPath(r.primaryLocale, route.locale, post.slug)}
                    >
                      <b>{post.title}</b>
                    </a>
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
      </ClientBlogShell>
    );
  }

  // ── Article (strict per-URL locale: a sibling URL renders only its locale)
  const post = await getBrandBlogPost(r.brandId, route.slug, route.locale);
  if (!post || post.locale !== route.locale) notFound();

  const canonical = blogUrl(r.host, r.primaryLocale, route.locale, route.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_image_url ? [post.cover_image_url] : undefined,
    inLanguage: post.locale,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at ?? post.published_at ?? undefined,
    mainEntityOfPage: canonical,
    author: r.brandName
      ? { "@type": "Organization", name: r.brandName }
      : undefined,
    publisher: r.brandName
      ? { "@type": "Organization", name: r.brandName }
      : undefined,
  };

  return (
    <ClientBlogShell brandName={r.brandName}>
      <script
        type="application/ld+json"
        // server-rendered, content is our own structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BrandArticleView post={post} brandName={r.brandName} />
    </ClientBlogShell>
  );
}
