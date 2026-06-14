// Site fingerprinting — detect what platform/CMS a client's website runs on,
// so Sepio can later recommend the best publishing method.
//
// Task 1 / Phase 4 of the posting pipeline.
//
// CONTRACT (important):
//   - ADVISORY only, never authoritative. A "wordpress/high" result still must
//     be confirmed by an actual API probe before we publish anything.
//   - detectPlatform() NEVER throws. Any network error / non-2xx / parse error
//     is treated as "no signal"; worst case resolves to { custom, low }.
//   - Cheap + time-bounded: at most two network calls (homepage + wp-json),
//     run concurrently, each with a 3000ms AbortController timeout.
//
// The analysis is split into a pure classifier (`classifyFromSignals`) so it
// can be unit-tested without any network. detectPlatform() only does fetching,
// then hands the raw signals to the pure classifier.
//
// SSRF: all network calls go through safeFetch (validates the URL is public,
// forces manual redirects, re-validates each hop) — so detectPlatform is safe
// even if a caller forgets to pre-check.

import { safeFetch, type SafeFetchOptions } from "./ssrf-guard";

export type DetectedPlatform =
  | "wordpress"
  | "shopify"
  | "webflow"
  | "wix"
  | "squarespace"
  | "custom";

export type DetectConfidence = "high" | "medium" | "low";

export interface SiteFingerprint {
  platform: DetectedPlatform;
  confidence: DetectConfidence;
  /** Human-readable evidence, e.g. ["wp-json reachable: namespaces include wp/v2"]. */
  signals: string[];
  /** ISO timestamp of when detection ran. */
  checked_at: string;
}

const USER_AGENT = "SepioBot/1.0 (+https://sepio.app)";
const FETCH_TIMEOUT_MS = 3000;

export interface DetectOptions {
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable DNS lookup for testing the SSRF guard. Defaults to node:dns. */
  lookup?: SafeFetchOptions["lookup"];
}

// ---------------------------------------------------------------------------
// Pure classifier — no network, fully deterministic.
// ---------------------------------------------------------------------------

/** Raw evidence gathered by the network layer (or by a test fixture). */
export interface RawSignals {
  /** Homepage HTML body, or null if the homepage fetch failed. */
  homepageHtml: string | null;
  /** Homepage response headers, or null if the fetch failed. */
  homepageHeaders: Headers | null;
  /** Parsed JSON from {origin}/wp-json/, or null if it failed / wasn't JSON. */
  wpJson: unknown;
}

interface Classification {
  platform: DetectedPlatform;
  confidence: DetectConfidence;
  signals: string[];
}

function headerLookup(headers: Headers | null): (name: string) => string | null {
  return (name) => {
    if (!headers) return null;
    return headers.get(name);
  };
}

/** True if the wp-json payload looks like a WP REST root with a wp/v2 namespace. */
function wpJsonHasV2(wpJson: unknown): boolean {
  if (!wpJson || typeof wpJson !== "object") return false;
  const namespaces = (wpJson as { namespaces?: unknown }).namespaces;
  return Array.isArray(namespaces) && namespaces.includes("wp/v2");
}

/**
 * Pure platform classifier. Ordered cheapest+most-reliable first. An actionable
 * API success (wp-json 200 with wp/v2) wins outright at high confidence; weaker
 * HTML/header heuristics resolve to medium/low.
 */
export function classifyFromSignals(raw: RawSignals): Classification {
  const html = raw.homepageHtml ?? "";
  const getHeader = headerLookup(raw.homepageHeaders);
  const checked: string[] = [];

  // 1a. WordPress — actionable API success (highest value, highest confidence).
  // wp-json with wp/v2 is the one signal backed by a real, usable publishing
  // API, so it always wins. If the homepage HTML also points at a *different*
  // platform, that's ambiguous — keep WordPress (the actionable one) but
  // downgrade to medium.
  if (wpJsonHasV2(raw.wpJson)) {
    const conflict = htmlSuggestsNonWordPress(html);
    return {
      platform: "wordpress",
      confidence: conflict ? "medium" : "high",
      signals: conflict
        ? [
            "wp-json reachable: namespaces include wp/v2",
            `conflicting homepage markers (${conflict}) — confidence downgraded`,
          ]
        : ["wp-json reachable: namespaces include wp/v2"],
    };
  }
  checked.push("wp-json probe: no wp/v2 namespace");

  // 1b. WordPress — HTML fallback (generator meta or wp-content/wp-includes).
  const wpGenerator = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress[^"']*["']/i,
  );
  if (wpGenerator) {
    return {
      platform: "wordpress",
      confidence: "medium",
      signals: [`generator meta = ${stripGeneratorContent(wpGenerator[0])}`],
    };
  }
  if (html.includes("/wp-content/") || html.includes("/wp-includes/")) {
    return {
      platform: "wordpress",
      confidence: "medium",
      signals: ["asset paths reference wp-content/ or wp-includes/"],
    };
  }
  checked.push("homepage HTML: no WordPress generator/asset markers");

  // 2. Shopify — header is authoritative-ish (high), CDN/theme markers medium.
  const shopId = getHeader("x-shopid") ?? getHeader("x-shopify-stage");
  if (shopId) {
    return {
      platform: "shopify",
      confidence: "high",
      signals: ["response header X-ShopId present"],
    };
  }
  if (html.includes("cdn.shopify.com") || html.includes("Shopify.theme")) {
    return {
      platform: "shopify",
      confidence: "medium",
      signals: ["homepage HTML references cdn.shopify.com / Shopify.theme"],
    };
  }
  checked.push("homepage HTML/headers: no Shopify markers");

  // 3. Wix — X-Wix-* header (high), generator meta / static.wixstatic.com (medium).
  if (hasWixHeader(raw.homepageHeaders)) {
    return {
      platform: "wix",
      confidence: "high",
      signals: ["response header X-Wix-* present"],
    };
  }
  if (
    /<meta[^>]+content=["']Wix\.com Website Builder["']/i.test(html) ||
    html.includes("static.wixstatic.com")
  ) {
    return {
      platform: "wix",
      confidence: "medium",
      signals: [
        "homepage HTML references Wix.com generator / static.wixstatic.com",
      ],
    };
  }
  checked.push("homepage HTML/headers: no Wix markers");

  // 4. Squarespace — static1.squarespace.com asset host or the signature comment.
  if (
    html.includes("static1.squarespace.com") ||
    html.includes("<!-- This is Squarespace. -->")
  ) {
    return {
      platform: "squarespace",
      confidence: "medium",
      signals: [
        "homepage HTML references static1.squarespace.com / Squarespace comment",
      ],
    };
  }
  checked.push("homepage HTML: no Squarespace markers");

  // 5. Webflow — generator meta, data-wf-domain attr, or website-files.com host.
  if (
    /<meta[^>]+content=["']Webflow["']/i.test(html) ||
    html.includes("data-wf-domain") ||
    html.includes("assets.website-files.com")
  ) {
    return {
      platform: "webflow",
      confidence: "medium",
      signals: [
        "homepage HTML references Webflow generator / data-wf-domain / website-files.com",
      ],
    };
  }
  checked.push("homepage HTML: no Webflow markers");

  // 6. Nothing matched.
  return {
    platform: "custom",
    confidence: "low",
    signals: checked,
  };
}

/** Returns a short marker name if the HTML clearly points at a non-WP platform. */
function htmlSuggestsNonWordPress(html: string): string | null {
  if (html.includes("cdn.shopify.com") || html.includes("Shopify.theme")) {
    return "Shopify";
  }
  if (html.includes("static.wixstatic.com")) return "Wix";
  if (html.includes("static1.squarespace.com")) return "Squarespace";
  if (
    html.includes("data-wf-domain") ||
    html.includes("assets.website-files.com")
  ) {
    return "Webflow";
  }
  return null;
}

function stripGeneratorContent(metaTag: string): string {
  const m = metaTag.match(/content=["']([^"']*)["']/i);
  return m ? m[1] : metaTag;
}

function hasWixHeader(headers: Headers | null): boolean {
  if (!headers) return false;
  for (const [key] of headers) {
    if (key.toLowerCase().startsWith("x-wix-")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Network layer.
// ---------------------------------------------------------------------------

/**
 * Normalize a user-supplied URL. Accepts bare domains (adds https://). Returns
 * null if it cannot be parsed into an http(s) URL.
 */
export function normalizeUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

// NOTE: the abort timer must stay armed through the BODY read, not just until
// headers arrive — a slow/stalled body would otherwise hang past the timeout.
// So each fetch helper owns its controller/timer for the whole request+parse.

async function fetchHomepage(
  url: string,
  fetchImpl: typeof fetch,
  lookup: SafeFetchOptions["lookup"],
): Promise<{ html: string | null; headers: Headers | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(
      url,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      },
      { fetchImpl, lookup },
    );
    if (!res.ok) return { html: null, headers: null };
    const headers = res.headers;
    try {
      const html = await res.text(); // still under the same abort timer
      return { html, headers };
    } catch {
      return { html: null, headers };
    }
  } catch {
    return { html: null, headers: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWpJson(
  origin: string,
  fetchImpl: typeof fetch,
  lookup: SafeFetchOptions["lookup"],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(
      `${origin}/wp-json/`,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      },
      { fetchImpl, lookup },
    );
    if (!res.ok) return null;
    return await res.json(); // body read under the same abort timer
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect the platform a website runs on. Never throws. Makes at most two
 * concurrent, time-bounded network calls (homepage + {origin}/wp-json/).
 */
export async function detectPlatform(
  url: string,
  options: DetectOptions = {},
): Promise<SiteFingerprint> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const checked_at = new Date().toISOString();

  const normalized = normalizeUrl(url);
  if (!normalized) {
    return {
      platform: "custom",
      confidence: "low",
      signals: [`could not parse URL: ${url}`],
      checked_at,
    };
  }

  const [homepageResult, wpJsonResult] = await Promise.allSettled([
    fetchHomepage(normalized.toString(), fetchImpl, options.lookup),
    fetchWpJson(normalized.origin, fetchImpl, options.lookup),
  ]);

  const homepage =
    homepageResult.status === "fulfilled"
      ? homepageResult.value
      : { html: null, headers: null };
  const wpJson = wpJsonResult.status === "fulfilled" ? wpJsonResult.value : null;

  const classification = classifyFromSignals({
    homepageHtml: homepage.html,
    homepageHeaders: homepage.headers,
    wpJson,
  });

  return { ...classification, checked_at };
}
