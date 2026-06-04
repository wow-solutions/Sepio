import type { MetadataRoute } from "next";
import { localizedUrl, hreflangAlternates } from "@/lib/seo";

// Public, index-worthy pages only. Auth/authed/api routes are excluded here and
// disallowed in robots.ts. URLs follow localePrefix: "as-needed" (en unprefixed).
const PAGES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "pricing", changeFrequency: "weekly", priority: 0.8 },
  { path: "privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "terms", changeFrequency: "monthly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: localizedUrl("en", path),
    lastModified,
    changeFrequency,
    priority,
    alternates: hreflangAlternates(path),
  }));
}
