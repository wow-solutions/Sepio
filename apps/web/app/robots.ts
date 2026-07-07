import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/seo";
import { bareHost } from "@/lib/app-host";
import { resolveBlogDomain } from "@/lib/blog-domain";

// Authed/auth route segments to disallow. Listed for the default locale; the
// /es and /ru localized variants are added below so crawlers see them too.
const PRIVATE_PATHS = [
  "/dashboard",
  "/writer",
  "/brands",
  "/posts",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
];

// AI crawlers we explicitly welcome on client blogs: answer-engine bots
// (being in these indexes is the whole point — content that AI search cites)
// plus the training-data crawlers that feed those models. A bare allow-all
// already permits them; listing them makes intent explicit.
const AI_BOTS = [
  "Googlebot",
  "Google-Extended",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "GPTBot",
  "CCBot",
];

// Host-aware: reading headers() makes this a dynamic route handler. The proxy
// excludes /robots.txt, so on a client blog domain this runs with that host.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = bareHost((await headers()).get("host"));
  const domain = await resolveBlogDomain(host);

  if (domain) {
    // Client blog domain: everything is public and indexable; welcome AI bots.
    const origin = `https://${host}`;
    return {
      rules: [
        { userAgent: "*", allow: "/" },
        { userAgent: AI_BOTS, allow: "/" },
      ],
      sitemap: `${origin}/sitemap.xml`,
      host: origin,
    };
  }

  // Sepio app host: original behavior.
  const localized = PRIVATE_PATHS.flatMap((p) => [p, `/es${p}`, `/ru${p}`]);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...localized],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
