// Format adapter — Phase 1, Lane B.
// Takes one piece of content from the engine and reshapes it per platform
// using rule-based logic (no LLM). Rules trace to
// wiki/concepts/platform-formatting-best-practices.md.
//
// Scope (office-hours 2026-05-26, decision I1 + Approach B): rule-based only.
// LLM-based per-platform rewriting and the auto-research advisor are Phase 2
// (TODO #22). So these adapters do mechanical transforms (markdown→unicode-bold,
// HTML formatting, length caps, metadata derivation) and emit `warnings` for
// anything that needs human or LLM judgment rather than guessing.

export type Platform = "linkedin" | "telegram" | "blog";

/** Engine output — the source content before per-platform shaping. */
export interface SourcePost {
  /** Main body text. */
  text: string;
  /** Suggested hashtags, WITHOUT the leading '#'. */
  hashtags?: string[];
  /** Optional call-to-action URL. */
  ctaUrl?: string | null;
  /** Optional image URL. */
  imageUrl?: string | null;
  /** Primary language, e.g. 'en' | 'es' | 'ru'. Affects nothing destructive. */
  language?: string;
}

export interface LinkedInPost {
  platform: "linkedin";
  /** Plain-text body (no markdown); emphasis via unicode-bold glyphs; hashtags appended. */
  text: string;
  /** CTA link moved here to avoid the in-body link reach penalty (post it as the first comment). */
  firstComment: string | null;
  imageUrl: string | null;
  warnings: string[];
}

export interface TelegramPost {
  platform: "telegram";
  /** Message text with HTML entities; HTML-escaped outside tags. */
  text: string;
  parseMode: "HTML";
  /** Suppress the link preview card unless the post is image-led. */
  disableWebPagePreview: boolean;
  /** True when `text` is meant as a photo caption (≤1024) rather than a standalone message (≤4096). */
  asCaption: boolean;
  warnings: string[];
}

export interface BlogPost {
  platform: "blog";
  /** ≤60 chars. */
  title: string;
  /** 150–160 chars target. */
  metaDescription: string;
  bodyMarkdown: string;
  warnings: string[];
}

export type AdaptedPost = LinkedInPost | TelegramPost | BlogPost;

/** A platform adapter. `adapt` is pure: same input → same output, no I/O. */
export interface FormatAdapter<T extends AdaptedPost = AdaptedPost> {
  readonly platform: Platform;
  adapt(post: SourcePost): T;
}
