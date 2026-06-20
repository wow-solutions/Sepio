// Pure path parsing + URL building for the client blog domain (_sites). No
// server imports → unit-testable. URL scheme on blog.client.com:
//   primary locale:    /            (index)   ·  /<slug>            (article)
//   additional locale: /<locale>    (index)   ·  /<locale>/<slug>   (article)

export type SitesRoute =
  | { kind: "index"; locale: string }
  | { kind: "article"; locale: string; slug: string }
  | { kind: "notfound" };

// Map the catch-all segments to a route. `known` = the brand's primary +
// additional locales; a leading segment that is a known locale is treated as a
// locale prefix, otherwise the first segment is a primary-locale article slug.
export function parseSitesPath(
  path: string[] | undefined,
  primaryLocale: string,
  locales: string[],
): SitesRoute {
  const known = new Set<string>([primaryLocale, ...locales]);
  const segs = (path ?? []).filter(Boolean);

  if (segs.length === 0) return { kind: "index", locale: primaryLocale };
  if (segs.length === 1) {
    return known.has(segs[0])
      ? { kind: "index", locale: segs[0] }
      : { kind: "article", locale: primaryLocale, slug: segs[0] };
  }
  if (segs.length === 2 && known.has(segs[0])) {
    return { kind: "article", locale: segs[0], slug: segs[1] };
  }
  return { kind: "notfound" };
}

// Clean path on the client domain for a (locale, slug?). Primary locale is
// unprefixed; additional locales carry a /<locale> prefix. "" → "/".
export function blogPath(
  primaryLocale: string,
  locale: string,
  slug?: string,
): string {
  const base = locale === primaryLocale ? "" : `/${locale}`;
  const tail = slug ? `/${slug}` : "";
  const p = `${base}${tail}`;
  return p === "" ? "/" : p;
}

// Absolute URL on the client host. `host` is the bare host (no scheme).
export function blogUrl(
  host: string,
  primaryLocale: string,
  locale: string,
  slug?: string,
): string {
  return `https://${host}${blogPath(primaryLocale, locale, slug)}`;
}
