import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedUrl } from "@/lib/seo";
import { getPublishedBySlug } from "@/lib/blog";
import { BlogBody } from "@/components/blog/blog-body";
import { BlogShell } from "../shell";
import { BlogPostJsonLd } from "../_components/blog-jsonld";

type Params = Promise<{ locale: string; slug: string }>;

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
  const { slug } = await params;
  const post = await getPublishedBySlug(slug);
  if (!post) return {}; // page renders notFound()

  // Blog content is en-only: canonical-only, NO hreflang (es/ru posts
  // don't exist — advertising them would be an SEO bug).
  const canonical = localizedUrl("en", `blog/${slug}`);
  const title = post.og_title ?? post.title;
  const description = post.og_description ?? post.description ?? undefined;
  const img = post.og_image_url ?? post.cover_image_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: "Sepio",
      locale: "en_US",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.material_updated_at ?? post.published_at ?? undefined,
      authors: post.author_name ? [post.author_name] : undefined,
      images: img ? [{ url: img, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: img ? [img] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale); // next-intl static-render hook
  const post = await getPublishedBySlug(slug);
  if (!post) notFound();

  const date = formatDate(post.published_at);

  return (
    <BlogShell>
      <BlogPostJsonLd post={post} />
      <article
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 24px 96px",
          color: "var(--ink)",
          fontSize: 15,
          lineHeight: 1.7,
        }}
        className="prose"
      >
        <h1>{post.title}</h1>
        {(post.author_name || date) && (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-faint)",
              margin: "0 0 32px",
            }}
          >
            {post.author_name && post.author_slug ? (
              <Link
                href={`/authors/${post.author_slug}`}
                style={{ color: "var(--ink-faint)" }}
              >
                {post.author_name}
              </Link>
            ) : (
              post.author_name
            )}
            {post.author_name && date ? " · " : ""}
            {date && <time dateTime={post.published_at ?? undefined}>{date}</time>}
          </p>
        )}
        <BlogBody source={post.body} />
      </article>
    </BlogShell>
  );
}
