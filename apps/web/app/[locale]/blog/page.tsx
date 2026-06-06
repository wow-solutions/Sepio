import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl, SITE_URL } from "@/lib/seo";
import {
  listPublished,
  BLOG_PER_PAGE,
  type BlogPostListRow,
} from "@/lib/blog";
import { splitFeatured, extractHeroImage } from "@/lib/blog-render";
import { BlogShell } from "./shell";
import { BlogIndexJsonLd } from "./_components/blog-jsonld";
import "./blog.css";

type Params = Promise<{ locale: string }>;
type Search = Promise<{ page?: string }>;

const TITLE = "Blog — Sepio";
const DESCRIPTION =
  "Notes on generative engine optimization, expert content, and turning client expertise into multi-platform content that AI assistants cite.";

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

// List rows carry no markdown body, so the hero comes from cover_image_url
// (or null). Adapt the list row to extractHeroImage's { cover_image_url, body }.
function heroUrlFor(post: BlogPostListRow): string | null {
  return extractHeroImage({
    cover_image_url: post.cover_image_url,
    body: post.body,
  }).heroUrl;
}

function bylineText(post: BlogPostListRow): {
  author: string | null;
  date: string | null;
} {
  return { author: post.author_name, date: formatDate(post.published_at) };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { locale } = await params;
  const { page } = await searchParams;
  const l = (locale as Locale) ?? "en";
  const p = Math.max(1, Number(page) || 1);

  // The /blog index genuinely exists at /blog, /es/blog, /ru/blog (the shell is
  // i18n even though content is en-only) -> full alternates. Page 1 stays
  // self-referential; deeper pages get a canonical that includes ?page=N.
  const base = alternatesFor(l, "blog");
  const canonical =
    p > 1 ? `${localizedUrl(l, "blog")}?page=${p}` : base?.canonical;

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: {
      ...base,
      canonical,
      types: { "application/rss+xml": `${SITE_URL}/feed.xml` },
    },
    openGraph: {
      type: "website",
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, "blog"),
      siteName: "Sepio",
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

function Byline({ post }: { post: BlogPostListRow }) {
  const { author, date } = bylineText(post);
  if (!author && !date) return null;
  return (
    <p className="bi-by">
      {author && <b>{author}</b>}
      {author && date ? " · " : ""}
      {date && (
        <time dateTime={post.published_at ?? undefined}>{date}</time>
      )}
    </p>
  );
}

function Card({ post }: { post: BlogPostListRow }) {
  const heroUrl = heroUrlFor(post);
  return (
    <Link className="bi-card" href={`/blog/${post.slug}`}>
      {heroUrl && (
        <span className="bi-card-ph">
          <img src={heroUrl} alt="" />
        </span>
      )}
      <h3>{post.title}</h3>
      {post.description && <p>{post.description}</p>}
      <Byline post={post} />
    </Link>
  );
}

export default async function BlogIndexPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale } = await params;
  const { page } = await searchParams; // opts into dynamic rendering
  setRequestLocale(locale as Locale);

  const p = Math.max(1, Number(page) || 1);
  const { posts, total } = await listPublished(p, BLOG_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PER_PAGE));

  // Featured lead only on page 1; deeper pages are a plain grid.
  const { featured, rest } =
    p === 1
      ? splitFeatured(posts)
      : { featured: null as BlogPostListRow | null, rest: posts };

  const featuredHero = featured ? heroUrlFor(featured) : null;

  return (
    <BlogShell>
      <BlogIndexJsonLd posts={posts} />
      <div className="blog-index">
        <header className="bi-head">
          <p className="bi-kick">The Sepio Journal</p>
          <h1>Blog</h1>
          <p>{DESCRIPTION}</p>
        </header>

        {posts.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", fontSize: 15 }}>
            No posts yet.
          </p>
        ) : (
          <>
            {featured && (
              <Link className="bi-lead" href={`/blog/${featured.slug}`}>
                {featuredHero && (
                  <span className="bi-lead-ph">
                    <img src={featuredHero} alt="" />
                  </span>
                )}
                <div>
                  <h2>{featured.title}</h2>
                  {featured.description && (
                    <p className="bi-dek">{featured.description}</p>
                  )}
                  <Byline post={featured} />
                </div>
              </Link>
            )}

            {rest.length > 0 && (
              <>
                {featured && (
                  <p className="bi-more-h">More from the journal</p>
                )}
                <div className="bi-grid">
                  {rest.map((post) => (
                    <Card key={post.slug} post={post} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {totalPages > 1 && (
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 40,
              fontSize: 14,
            }}
          >
            {p > 1 ? (
              <Link
                href={p - 1 === 1 ? "/blog" : `/blog?page=${p - 1}`}
                style={{ color: "var(--ink)" }}
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span style={{ color: "var(--ink-faint)" }}>
              Page {p} of {totalPages}
            </span>
            {p < totalPages ? (
              <Link href={`/blog?page=${p + 1}`} style={{ color: "var(--ink)" }}>
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </BlogShell>
  );
}
