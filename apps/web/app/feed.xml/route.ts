import { listPublished } from "@/lib/blog";
import { SITE_URL, localizedUrl } from "@/lib/seo";

// RSS 2.0 feed for the blog at /feed.xml. Top-level route handler (parallel to
// app/sitemap.ts and app/robots.ts) so next-intl never localizes it.
//
// IMPORTANT: feed.xml must be excluded in proxy.ts's matcher, exactly like
// sitemap.xml/robots.txt — otherwise next-intl swallows the path and returns a
// 404 at runtime (the build won't catch it). See blog PR #34.
export const revalidate = 3600; // rebuild the feed at most hourly

const FEED_TITLE = "Sepio Blog";
const FEED_DESCRIPTION =
  "Notes on generative engine optimization, expert content, and turning client expertise into multi-platform content that AI assistants cite.";
const FEED_LIMIT = 50;

// XML text escaping for element content (and attribute values).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rfc822(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
}

export async function GET() {
  const { posts } = await listPublished(1, FEED_LIMIT);

  const feedUrl = `${SITE_URL}/feed.xml`;
  const blogUrl = localizedUrl("en", "blog");
  const lastBuildDate = rfc822(posts[0]?.published_at ?? null) ?? new Date().toUTCString();

  const items = posts
    .map((p) => {
      const url = localizedUrl("en", `blog/${p.slug}`);
      const pub = rfc822(p.published_at);
      return [
        "    <item>",
        `      <title>${esc(p.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        pub ? `      <pubDate>${pub}</pubDate>` : "",
        p.author_name ? `      <dc:creator>${esc(p.author_name)}</dc:creator>` : "",
        p.description ? `      <description>${esc(p.description)}</description>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(FEED_TITLE)}</title>
    <link>${blogUrl}</link>
    <description>${esc(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
