import { extractHeroImage } from "@/lib/blog-render";
import { BlogBody } from "@/components/blog/blog-body";

// Presentational render of one brand blog article. Shared by the Sepio-hosted
// /p/<brandId>/<slug> page and the client-domain _sites renderer so both stay
// in sync. Pure: no data fetching, no locale/router context.
export type ArticleViewPost = {
  title: string;
  excerpt: string | null;
  body_markdown: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  published_at: string | null;
};

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

export function BrandArticleView({
  post,
  brandName,
}: {
  post: ArticleViewPost;
  brandName: string | null;
}) {
  const date = formatDate(post.published_at);
  const { heroUrl, body } = extractHeroImage({
    cover_image_url: post.cover_image_url,
    body: post.body_markdown ?? "",
  });

  return (
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
  );
}
