import { headers } from "next/headers";
import { listPublished } from "@/lib/blog";
import { listBrandBlogPosts } from "@/lib/brand-blog";
import { localizedUrl } from "@/lib/seo";
import { bareHost } from "@/lib/app-host";
import { resolveBlogDomain } from "@/lib/blog-domain";
import { blogUrl } from "@/lib/blog-domain-routing";

// llms.txt (llmstxt.org convention): a Markdown index that points AI
// crawlers/agents at the same published content robots.ts and sitemap.ts
// expose to search engines. Host-aware, like those files — reading headers()
// makes this a dynamic route handler.
//
// IMPORTANT: llms.txt must be excluded in proxy.ts's matcher, exactly like
// sitemap.xml/robots.txt/feed.xml — otherwise next-intl swallows the path and
// returns a 404 at runtime (the build won't catch it).
export const revalidate = 3600;

const SEPIO_SUMMARY =
  "Sepio is a publishing automation platform: write one brand voice once, and Sepio adapts it into native posts for LinkedIn, Telegram, Instagram, TikTok, Threads and a hosted blog, then publishes each on the schedule you set. This blog covers generative engine optimization, expert content, and turning client expertise into multi-platform content that AI assistants cite.";
const SEPIO_ARTICLES_LIMIT = 50;

function entry(title: string, url: string, excerpt: string | null): string {
  return excerpt ? `- [${title}](${url}): ${excerpt}` : `- [${title}](${url})`;
}

// Client blog domain: brand name/host as the title, every published post
// across the brand's locales. Locales are only broken into subsections when
// the brand actually serves more than one.
async function clientBlogLlmsTxt(
  host: string,
  brandId: string,
  brandName: string | null,
  primaryLocale: string,
  locales: string[],
): Promise<string> {
  const name = brandName ?? host;
  const allLocales = [primaryLocale, ...locales];

  const perLocale = await Promise.all(
    allLocales.map(async (locale) => ({
      locale,
      entries: (await listBrandBlogPosts(brandId, locale)).map((p) =>
        entry(p.title, blogUrl(host, primaryLocale, locale, p.slug), p.excerpt),
      ),
    })),
  );

  const articles =
    allLocales.length > 1
      ? perLocale
          .filter((l) => l.entries.length > 0)
          .map((l) => `### ${l.locale}\n\n${l.entries.join("\n")}`)
          .join("\n\n")
      : perLocale[0].entries.join("\n");

  return `# ${name}\n\n> Blog by ${name}.\n\n## Articles\n\n${articles}\n`;
}

// Sepio app host: product overview + the marketing pages worth crawling +
// the marketing blog's published posts.
async function sepioLlmsTxt(): Promise<string> {
  const { posts } = await listPublished(1, SEPIO_ARTICLES_LIMIT);

  const pages = [
    entry("Home", localizedUrl("en", ""), null),
    entry("Blog", localizedUrl("en", "blog"), null),
    entry("Editorial Policy", localizedUrl("en", "blog/editorial-policy"), null),
  ].join("\n");

  const articles = posts
    .map((p) => entry(p.title, localizedUrl("en", `blog/${p.slug}`), p.description))
    .join("\n");

  return `# Sepio\n\n> ${SEPIO_SUMMARY}\n\n## Pages\n\n${pages}\n\n## Articles\n\n${articles}\n`;
}

export async function GET() {
  const host = bareHost((await headers()).get("host"));
  const domain = await resolveBlogDomain(host);

  const body = domain
    ? await clientBlogLlmsTxt(
        host,
        domain.brandId,
        domain.brandName,
        domain.primaryLocale,
        domain.locales,
      )
    : await sepioLlmsTxt();

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
