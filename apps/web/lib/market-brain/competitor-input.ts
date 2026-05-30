// Pure parsing for agency-supplied competitor URLs (T8 PR-C). Used by the brand
// page server action and the wizard seed path. Public — no moat, just input
// normalization shared with the scraper's domain convention.

export type CompetitorInput = { url: string; domain: string };

// Normalize a user-typed competitor URL into { url, domain }. Accepts bare
// domains ("acme.com"), full URLs, and strips a leading "www.". Returns null for
// anything that isn't a plausible web host (no dot, unparseable). The caller
// persists url verbatim (scraper seed) + domain (cache key / unique(brand,domain)).
export function parseCompetitorUrl(raw: string): CompetitorInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
  // Require an apex with a dot (rejects "localhost", bare hostnames, IPs-ish typos).
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return null;
  }

  return { url: withProtocol, domain };
}
