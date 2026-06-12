// Platform-aware post-body helpers (kitchen).
//
// A blog/hosted post stores its body in `content_markdown` — the canonical
// column the hosted publisher reads (`content_markdown ?? content_text`).
// LinkedIn and other social posts use `content_text`. Centralizing the split
// here keeps it in ONE place instead of being re-derived (and re-broken) at
// every read/write seam: writer save, /posts/[id] edit, the refine route, and
// the Editorial Memory apply actions all route through these.

import type { TablesUpdate } from "@/lib/supabase/database.types";

type PostBodyColumns = {
  platform: string;
  content_text: string | null;
  content_markdown: string | null;
};

/** The canonical body text for a post, by platform. Empty string when absent. */
export function getPostBody(post: PostBodyColumns): string {
  return (
    (post.platform === "hosted" ? post.content_markdown : post.content_text) ?? ""
  );
}

/**
 * The column patch that writes `content` to the right body column for a
 * platform. Spread into an `update({...})` literal alongside `updated_at` etc.
 */
export function bodyUpdateForPlatform(
  platform: string,
  content: string,
): TablesUpdate<"posts"> {
  return platform === "hosted"
    ? { content_markdown: content }
    : { content_text: content };
}

/**
 * Max body length by platform. Long-form blog articles (~1500-2000 words)
 * easily exceed 12k chars, so hosted gets generous headroom; social posts stay
 * tightly bounded.
 */
export function maxBodyChars(platform: string): number {
  return platform === "hosted" ? 50_000 : 10_000;
}
