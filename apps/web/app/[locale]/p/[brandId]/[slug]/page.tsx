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
  const post = await getBrandBlogPost(brandId, slug, locale);
  if (!post) return {}; // page renders notFound()

  const title = post.title;
  const description = post.excerpt ?? undefined;
  const img = post.cover_image_url ?? undefined;

  // Once the brand publishes under its own domain (blog.client.com), this
  // Sepio-domain copy is a duplicate — noindex it so the client-domain article
  // is the one search/AI engines surface (it is self-canonical + indexable).
  const blogDomain = await activeBlogDomainForBrand(brandId);

  return {
    title,
    description,
    robots: blogDomain ? { index: false, follow: true } : undefined,
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
