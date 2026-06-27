import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getBrandBlogPost, getBrandName } from "@/lib/brand-blog";
import { activeBlogDomainForBrand } from "@/lib/blog-domain";
import { BrandArticleView } from "@/components/blog/brand-article-view";
import { BlogShell } from "../../../blog/shell";
import "../../../blog/blog.css";

type Params = Promise<{ locale: string; brandId: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, brandId, slug } = await params;

  // Gate FIRST, before fetching the post: the Sepio-hosted /p/ page exists only
  // as a noindex duplicate for brands that publish under their own domain. With
  // no active domain the page 404s — so don't leak the title/OG via metadata
  // either. (Mirrors the notFound() in the page body below.)
  const blogDomain = await activeBlogDomainForBrand(brandId);
  if (!blogDomain) return {};

  const post = await getBrandBlogPost(brandId, slug, locale);
  if (!post) return {}; // page renders notFound()

  const title = post.title;
  const description = post.excerpt ?? undefined;
  const img = post.cover_image_url ?? undefined;

  return {
    title,
    description,
    // Always noindex here: we only reach this point when the brand has its own
    // domain, where that article is the canonical, indexable copy.
    robots: { index: false, follow: true },
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

export default async function BrandBlogPostPage({
  params,
}: {
  params: Params;
}) {
  const { locale, brandId, slug } = await params;
  setRequestLocale(locale as Locale); // next-intl static-render hook

  // Serve only as the noindex duplicate of a brand's own-domain blog. No active
  // domain → the blog isn't "connected", so /p/ is not a public address. 404.
  const blogDomain = await activeBlogDomainForBrand(brandId);
  if (!blogDomain) notFound();

  const post = await getBrandBlogPost(brandId, slug, locale);
  if (!post) notFound();

  // brands has no anon-read RLS, so this is null for public visitors — render
  // gracefully without the attribution line (the title carries the page).
  const brandName = await getBrandName(brandId);

  return (
    <BlogShell>
      <BrandArticleView post={post} brandName={brandName} />
    </BlogShell>
  );
}
