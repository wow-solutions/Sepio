import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";

// Public origin. metadataBase is set in the root layout; we build full absolute
// URLs here to avoid the path-resolution surprises noted in the Next 16 docs.
export const SITE_URL = "https://sepio.app";

// Build the canonical URL for a locale + path under localePrefix: "as-needed".
// `path` is the unprefixed path WITHOUT a leading slash: "" | "pricing" | ...
// en (default) is unprefixed; es/ru are prefixed. Landing en -> trailing slash.
export function localizedUrl(locale: Locale, path: string): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  const seg = path ? `/${path}` : "";
  const url = `${SITE_URL}${prefix}${seg}`;
  return url === SITE_URL ? `${SITE_URL}/` : url;
}

// hreflang alternates for a given locale-agnostic path. x-default -> en.
export function hreflangAlternates(path: string): {
  languages: Record<string, string>;
} {
  return {
    languages: {
      en: localizedUrl("en", path),
      es: localizedUrl("es", path),
      ru: localizedUrl("ru", path),
      "x-default": localizedUrl("en", path),
    },
  };
}

// alternates block (canonical + hreflang languages) for a page's generateMetadata.
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizedUrl(locale, path),
    ...hreflangAlternates(path),
  };
}
