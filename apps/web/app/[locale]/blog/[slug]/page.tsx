import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedUrl } from "@/lib/seo";
import { getPublishedBySlug } from "@/lib/blog";
import { extractHeroImage } from "@/lib/blog-render";
import { BlogBody } from "@/components/blog/blog-body";
import { BlogShell } from "../shell";
import { BlogPostJsonLd } from "../_components/blog-jsonld";
import "../blog.css";

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
  const { heroUrl, body } = extractHeroImage(post);
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / 200));

  return (
    <BlogShell>
      <BlogPostJsonLd post={post} />
      <article className="blog-article">
        <p className="ba-eyebrow">Field notes</p>
        <h1 className="ba-headline">{post.title}</h1>
        {post.description && (
          <p className="ba-standfirst">{post.description}</p>
        )}
        <div className="ba-meta">
          <span className="ba-dot" aria-hidden="true" />
          {post.author_name && (
            <span>
              By{" "}
              {post.author_slug ? (
                <Link href={`/authors/${post.author_slug}`}>
                  <b>{post.author_name}</b>
                </Link>
              ) : (
                <b>{post.author_name}</b>
              )}
            </span>
          )}
          {post.author_name && date && <span>·</span>}
          {date && (
            <time dateTime={post.published_at ?? undefined}>{date}</time>
          )}
          {(post.author_name || date) && <span>·</span>}
          <span>{readMinutes} min read</span>
        </div>

        {heroUrl && (
          <figure className="ba-hero">
            <img src={heroUrl} alt="" loading="lazy" />
          </figure>
        )}

        <div className="ba-body">
          <BlogBody source={body} />
        </div>
      </article>
    </BlogShell>
  );
}
