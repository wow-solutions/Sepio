import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { extractHeroImage } from "@/lib/blog-render";
import { BlogBody } from "@/components/blog/blog-body";
import {
  getBrandBlogPost,
  getBrandName,
  type BrandBlogPostRow,
} from "@/lib/brand-blog";
import { BlogShell } from "../../../blog/shell";
import "../../../blog/blog.css";

type Params = Promise<{ locale: string; brandId: string; slug: string }>;

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
  const { locale, brandId, slug } = await params;
  const post = await getBrandBlogPost(brandId, slug, locale);
  if (!post) return {}; // page renders notFound()

  const title = post.title;
  const description = post.excerpt ?? undefined;
  const img = post.cover_image_url ?? undefined;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      siteName: "Sepio",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? post.published_at ?? undefined,
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

// extractHeroImage expects { cover_image_url, body }; brand posts store the
// article in body_markdown. Adapt to that shape (null body -> "").
function heroSource(post: BrandBlogPostRow): {
  cover_image_url: string | null;
  body: string;
} {
  return {
    cover_image_url: post.cover_image_url,
    body: post.body_markdown ?? "",
  };
}

export default async function BrandBlogPostPage({
  params,
}: {
  params: Params;
}) {
  const { locale, brandId, slug } = await params;
  setRequestLocale(locale as Locale); // next-intl static-render hook

  const post = await getBrandBlogPost(brandId, slug, locale);
  if (!post) notFound();

  // brands has no anon-read RLS, so this is null for public visitors — render
  // gracefully without the attribution line (the title carries the page).
  const brandName = await getBrandName(brandId);

  const date = formatDate(post.published_at);
  const { heroUrl, body } = extractHeroImage(heroSource(post));

  return (
    <BlogShell>
      <article className="blog-article">
        {brandName && <p className="ba-eyebrow">{brandName}</p>}
        <h1 className="ba-headline">{post.title}</h1>
        {post.excerpt && <p className="ba-standfirst">{post.excerpt}</p>}
        {date && (
          <div className="ba-meta">
            <span className="ba-dot" aria-hidden="true" />
            <time dateTime={post.published_at ?? undefined}>{date}</time>
          </div>
        )}

        {heroUrl && (
          <figure className="ba-hero">
            <img src={heroUrl} alt={post.cover_image_alt ?? ""} loading="lazy" />
          </figure>
        )}

        <div className="ba-body">
          <BlogBody source={body} />
        </div>
      </article>
    </BlogShell>
  );
}
