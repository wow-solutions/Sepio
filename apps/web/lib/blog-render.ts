// Pure render helpers for the blog redesign (no side effects).
// Generic shapes so they accept BlogPostRow / BlogPostListRow without importing them.

type HeroSource = {
  cover_image_url: string | null;
  body: string;
};

// Matches the FIRST markdown image: ![alt](url) or ![alt](url "title").
// Capture group 1 is the URL ONLY (stops at whitespace), so an optional title
// is excluded from the src; match[0] is the full token so the whole image is
// stripped from the body. Limitation: assumes simple inline images (no fenced
// code blocks, linked images, or reference-style) — fine for authored posts.
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/;

/**
 * Decide which image leads the article and strip it from the body if it came
 * from the body itself.
 * - cover_image_url present  -> use it, body unchanged.
 * - else first markdown image -> use its url, remove that single token from body.
 * - else                      -> heroUrl null, body unchanged.
 */
export function extractHeroImage<T extends HeroSource>(
  post: T,
): { heroUrl: string | null; body: string } {
  if (post.cover_image_url && post.cover_image_url.length > 0) {
    return { heroUrl: post.cover_image_url, body: post.body };
  }

  const match = MARKDOWN_IMAGE.exec(post.body);
  if (match) {
    const heroUrl = match[1];
    const body = stripImageLeftoverBlank(post.body, match[0]);
    return { heroUrl, body };
  }

  return { heroUrl: null, body: post.body };
}

// Remove `token` from `source`; if that empties the line it sat on, drop the
// empty line too. The rest of the body is preserved verbatim.
function stripImageLeftoverBlank(source: string, token: string): string {
  const idx = source.indexOf(token);
  if (idx === -1) return source;

  // Find start and end of the line containing the token.
  const lineStart = source.lastIndexOf("\n", idx - 1) + 1; // 0 if not found
  let lineEnd = source.indexOf("\n", idx);
  if (lineEnd === -1) lineEnd = source.length;

  const line = source.slice(lineStart, lineEnd);
  const lineWithoutToken = line.replace(token, "");

  if (lineWithoutToken.trim() === "") {
    // Drop the whole line plus its trailing newline (if any).
    const dropEnd = lineEnd < source.length ? lineEnd + 1 : lineEnd;
    const before = source.slice(0, lineStart);
    const after = source.slice(dropEnd);
    // If both sides already carry a blank-line separator, removing the image
    // line would stack them (e.g. "A\n\n\nB"). Collapse to a single blank line.
    if (before.endsWith("\n\n") && after.startsWith("\n")) {
      return before + after.slice(1);
    }
    return before + after;
  }

  // Token was inline with other content: just remove the token.
  return source.slice(0, lineStart) + lineWithoutToken + source.slice(lineEnd);
}

/**
 * Split a newest-first list into the featured lead + the rest.
 */
export function splitFeatured<T>(posts: T[]): { featured: T | null; rest: T[] } {
  return {
    featured: posts.length > 0 ? posts[0] : null,
    rest: posts.slice(1),
  };
}
