import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

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

export default function robots(): MetadataRoute.Robots {
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
