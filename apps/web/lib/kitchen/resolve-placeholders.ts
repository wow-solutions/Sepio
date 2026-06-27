// Content Kitchen — cross-link placeholder resolver (pure, no DB / no I/O).
//
// Thin social formats embed the literal token {{PRIMARY_URL}} in their body. At
// publish/export time we substitute the URL of the FULLEST published destination
// in the same content group (e.g. the blog article the social post links back to).

import {
  type ChannelId,
  FULLNESS_RANK,
  PRIMARY_URL_TOKEN,
} from "@/lib/kitchen/channel-formats";

export type Variant = {
  platform: string;
  status: string;
  external_post_url: string | null;
};

// Unknown platforms rank last (after every known channel).
const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;

function fullnessRank(platform: string): number {
  return FULLNESS_RANK[platform as ChannelId] ?? UNKNOWN_RANK;
}

function isPublishedWithUrl(v: Variant): boolean {
  return v.status === "published" && !!v.external_post_url && v.external_post_url.length > 0;
}

function toAbsolute(url: string, appOrigin: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${appOrigin.replace(/\/+$/, "")}${url}`;
  return url;
}

// Pick the absolute URL of the fullest published destination, or null if none.
export function pickPrimaryUrl(variants: Variant[], appOrigin: string): string | null {
  let best: Variant | null = null;
  for (const v of variants) {
    if (!isPublishedWithUrl(v)) continue;
    if (best === null || fullnessRank(v.platform) < fullnessRank(best.platform)) {
      best = v;
    }
  }
  if (best === null || best.external_post_url === null) return null;
  return toAbsolute(best.external_post_url, appOrigin);
}

// Cross-links from a social post point ONLY at the blog article — never at
// another social channel. (pickPrimaryUrl would fall back to e.g. the LinkedIn
// URL when no blog exists; that's wrong for the {{PRIMARY_URL}} token, which
// means "the fuller article".) Returns the published hosted variant's absolute
// URL, or null → caller strips the token.
export function pickBlogUrl(variants: Variant[], appOrigin: string): string | null {
  const blog = variants.find(
    (v) => v.platform === "hosted" && isPublishedWithUrl(v),
  );
  if (!blog || blog.external_post_url === null) return null;
  return toAbsolute(blog.external_post_url, appOrigin);
}

// Substitute every {{PRIMARY_URL}} token. When primaryUrl is null, remove the
// token and tidy the artifacts it leaves behind (empty markdown links, empty
// parens, doubled spaces).
export function applyPrimaryUrl(body: string, primaryUrl: string | null): string {
  if (primaryUrl !== null) {
    return body.split(PRIMARY_URL_TOKEN).join(primaryUrl);
  }

  // First drop a dangling invite that sits DIRECTLY in front of the token
  // ("Read the full article: {{PRIMARY_URL}}") — without the URL the label is
  // meaningless and would publish as orphaned copy. Targeted: only when the
  // phrase immediately precedes the token (won't touch a markdown link or text
  // that merely contains these words elsewhere).
  let out = body.replace(
    /[^\S\n]*\b(?:read(?:\s+the)?\s+full\s+article|full\s+article|full\s+piece|read\s+more|learn\s+more|more\s+here|details?)\b\s*:?\s*\{\{PRIMARY_URL\}\}/gi,
    "",
  );
  // Strip any remaining tokens, then collapse the most common orphaned wrappers.
  out = out.split(PRIMARY_URL_TOKEN).join("");
  // Empty markdown link: [text]() → text
  out = out.replace(/\[([^\]]*)\]\(\s*\)/g, "$1");
  // Orphaned empty parens left by the removed URL.
  out = out.replace(/\(\s*\)/g, "");
  // Collapse doubled spaces created by the removals (keep newlines intact).
  out = out.replace(/[^\S\n]{2,}/g, " ");
  // Tidy a stray space before sentence punctuation.
  out = out.replace(/ +([.,;:!?])/g, "$1");
  // Trim whitespace/newlines the removals may have left at the edges.
  return out.trim();
}

// Cross-links from a thin format must point at the blog. Guard the fan-out so a
// social variant is never published before its hosted foundation exists.
export function hostedFirstGuard(
  targetPlatform: string,
  variants: Variant[],
): { ok: true } | { ok: false; reason: string } {
  if (targetPlatform === "hosted") return { ok: true };
  const hostedPublished = variants.some(
    (v) => v.platform === "hosted" && isPublishedWithUrl(v),
  );
  if (!hostedPublished) {
    return { ok: false, reason: "Publish the blog first so links point to it" };
  }
  return { ok: true };
}

// Convenience: resolve a body's cross-link in one call. Does NOT enforce the
// guard — the caller decides whether to block on a missing hosted foundation.
export function resolveBody(
  body: string,
  _targetPlatform: string,
  variants: Variant[],
  appOrigin: string,
): string {
  return applyPrimaryUrl(body, pickPrimaryUrl(variants, appOrigin));
}
