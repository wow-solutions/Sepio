import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl, SITE_URL } from "@/lib/seo";
import { listPublished, BLOG_PER_PAGE } from "@/lib/blog";
import { BlogShell } from "./shell";
import { BlogIndexJsonLd } from "./_components/blog-jsonld";

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

  return (
    <BlogShell>
      <BlogIndexJsonLd posts={posts} />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 24px 96px",
          color: "var(--ink)",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          Blog
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--ink-faint)",
            margin: "0 0 48px",
          }}
        >
          {DESCRIPTION}
        </p>

        {posts.length === 0 ? (
          <p style={{ color: "var(--ink-faint)", fontSize: 15 }}>
            No posts yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((post) => {
              const date = formatDate(post.published_at);
              return (
                <li
                  key={post.slug}
                  style={{
                    padding: "24px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    style={{
                      display: "block",
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      color: "var(--ink)",
                      textDecoration: "none",
                      marginBottom: 6,
                    }}
                  >
                    {post.title}
                  </Link>
                  {date && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--ink-faint)",
                        margin: "0 0 8px",
                      }}
                    >
                      {post.author_name ? `${post.author_name} · ` : ""}
                      <time dateTime={post.published_at ?? undefined}>
                        {date}
                      </time>
                    </p>
                  )}
                  {post.description && (
                    <p
                      style={{
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: "var(--ink-muted, var(--ink))",
                        margin: 0,
                      }}
                    >
                      {post.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
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
