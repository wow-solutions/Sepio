import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedUrl } from "@/lib/seo";
import { getAuthor } from "@/lib/authors";
import { listPublishedByAuthor } from "@/lib/blog";
import { BlogShell } from "../../blog/shell";

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
  const author = getAuthor(slug);
  if (!author) return {}; // page renders notFound()

  // Author pages are en-only content (like blog posts): canonical-only, no
  // hreflang for non-existent translations.
  const canonical = localizedUrl("en", `authors/${slug}`);
  const title = `${author.name} — Sepio`;

  return {
    title,
    description: author.bio,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description: author.bio,
      url: canonical,
      siteName: "Sepio",
    },
  };
}

function AuthorJsonLd({
  slug,
  name,
  role,
  bio,
  sameAs,
}: {
  slug: string;
  name: string;
  role: string;
  bio: string;
  sameAs: string[];
}) {
  const canonical = localizedUrl("en", `authors/${slug}`);
  const graph = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name,
      jobTitle: role,
      description: bio,
      url: canonical,
      sameAs: sameAs.length ? sameAs : undefined,
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default async function AuthorPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale); // next-intl static-render hook
  const author = getAuthor(slug);
  if (!author) notFound();

  const posts = await listPublishedByAuthor(slug);

  return (
    <BlogShell>
      <AuthorJsonLd
        slug={author.slug}
        name={author.name}
        role={author.role}
        bio={author.bio}
        sameAs={author.sameAs}
      />
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
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          {author.name}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-faint)",
            margin: "0 0 24px",
          }}
        >
          {author.role}
        </p>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--ink-muted, var(--ink))",
            margin: "0 0 16px",
          }}
        >
          {author.bio}
        </p>
        {author.sameAs.length > 0 && (
          <p style={{ fontSize: 14, margin: "0 0 48px" }}>
            {author.sameAs.map((href, i) => (
              <span key={href}>
                {i > 0 ? " · " : ""}
                <a
                  href={href}
                  rel="me noopener noreferrer"
                  target="_blank"
                  style={{ color: "var(--ink)" }}
                >
                  {href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </span>
            ))}
          </p>
        )}

        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--ink)",
          }}
        >
          Posts
        </h2>
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
                    padding: "20px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    style={{
                      display: "block",
                      fontSize: 18,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      color: "var(--ink)",
                      textDecoration: "none",
                      marginBottom: 4,
                    }}
                  >
                    {post.title}
                  </Link>
                  {date && (
                    <time
                      dateTime={post.published_at ?? undefined}
                      style={{ fontSize: 13, color: "var(--ink-faint)" }}
                    >
                      {date}
                    </time>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BlogShell>
  );
}
