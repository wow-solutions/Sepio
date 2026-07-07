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
import { parseFaqSection } from "@/lib/blog-faq";
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

// Google guidance: headline <= 110 chars. Mirrors
// app/[locale]/blog/_components/blog-jsonld.tsx.
function headline(title: string): string {
  return title.length > 110 ? `${title.slice(0, 107)}…` : title;
}

// Native <script type="application/ld+json"> with the mandatory XSS escape,
// mirroring blog-jsonld.tsx's LdScript.
function LdScript({ graph }: { graph: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}

// "More from the blog" heading, in the article's own language. Falls back to
// English for locales we don't have a translation for.
const MORE_FROM_BLOG: Record<string, string> = {
  en: "More from the blog",
  es: "Más del blog",
  ru: "Ещё из блога",
};
function moreFromBlogLabel(locale: string): string {
  return MORE_FROM_BLOG[locale] ?? MORE_FROM_BLOG.en;
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
    const languages: Record<string, string> = {};
    for (const loc of r.routeableLocales) {
      languages[loc] = blogUrl(r.host, r.primaryLocale, loc);
    }
    languages["x-default"] = blogUrl(r.host, r.primaryLocale, r.primaryLocale);
    return {
      title: r.brandName ? `${r.brandName} — Blog` : "Blog",
      alternates: {
        canonical: blogUrl(r.host, r.primaryLocale, route.locale),
        languages,
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
      siteName: r.brandName ?? r.host,
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
    const homeUrl = blogUrl(r.host, r.primaryLocale, r.primaryLocale);
    const blogIndexUrl = blogUrl(r.host, r.primaryLocale, route.locale);
    const org = {
      "@type": "Organization",
      name: r.brandName ?? r.host,
      url: `https://${r.host}`,
    };
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Blog",
          "@id": blogIndexUrl,
          url: blogIndexUrl,
          name: `${r.brandName ?? r.host} — Blog`,
          inLanguage: route.locale,
          publisher: org,
          blogPost: posts.slice(0, 50).map((post) => ({
            "@type": "BlogPosting",
            headline: headline(post.title),
            url: blogUrl(r.host, r.primaryLocale, route.locale, post.slug),
            datePublished: post.published_at ?? undefined,
          })),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
            {
              "@type": "ListItem",
              position: 2,
              name: "Blog",
              item: blogIndexUrl,
            },
          ],
        },
      ],
    };
    return (
      <ClientBlogShell brandName={r.brandName}>
        <LdScript graph={graph} />
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
  const homeUrl = blogUrl(r.host, r.primaryLocale, r.primaryLocale);
  const blogIndexUrl = blogUrl(r.host, r.primaryLocale, route.locale);
  const org = {
    "@type": "Organization",
    name: r.brandName ?? r.host,
    url: `https://${r.host}`,
  };
  const faqPairs = parseFaqSection(post.body_markdown ?? "");

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: headline(post.title),
        description: post.excerpt ?? undefined,
        image: post.cover_image_url ? [post.cover_image_url] : undefined,
        inLanguage: post.locale,
        datePublished: post.published_at ?? undefined,
        dateModified: post.updated_at ?? post.published_at ?? undefined,
        mainEntityOfPage: canonical,
        author: org,
        publisher: org,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: blogIndexUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: canonical,
          },
        ],
      },
      ...(faqPairs.length >= 2
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faqPairs.map((pair) => ({
                "@type": "Question",
                name: pair.question,
                acceptedAnswer: { "@type": "Answer", text: pair.answer },
              })),
            },
          ]
        : []),
    ],
  };

  // Up to 4 sibling posts in the same locale, excluding the current article —
  // internal links AI crawlers can follow to discover more of the brand's content.
  const related = (await listBrandBlogPosts(r.brandId, route.locale))
    .filter((p) => p.slug !== route.slug)
    .slice(0, 4);

  return (
    <ClientBlogShell brandName={r.brandName}>
      <LdScript graph={graph} />
      <BrandArticleView post={post} brandName={r.brandName} />
      {related.length > 0 && (
        <section
          style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px 100px" }}
        >
          <h2 className="ba-headline" style={{ fontSize: "1.25rem" }}>
            {moreFromBlogLabel(route.locale)}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0" }}>
            {related.map((p) => {
              const date = formatDate(p.published_at);
              return (
                <li key={p.slug} style={{ marginBottom: "1.5rem" }}>
                  <a href={blogPath(r.primaryLocale, route.locale, p.slug)}>
                    <b>{p.title}</b>
                  </a>
                  {p.excerpt && (
                    <p style={{ margin: "0.25rem 0 0", opacity: 0.8 }}>
                      {p.excerpt}
                    </p>
                  )}
                  {date && (
                    <time
                      dateTime={p.published_at ?? undefined}
                      style={{ fontSize: "0.85rem", opacity: 0.6 }}
                    >
                      {date}
                    </time>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </ClientBlogShell>
  );
}
