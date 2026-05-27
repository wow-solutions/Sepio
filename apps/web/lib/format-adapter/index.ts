// Format adapter registry. Reshapes one engine output into per-platform payloads.
// Rules: wiki/concepts/platform-formatting-best-practices.md.

import { blogAdapter } from "./blog";
import { linkedinAdapter } from "./linkedin";
import { telegramAdapter } from "./telegram";
import type { AdaptedPost, FormatAdapter, Platform, SourcePost } from "./types";

const ADAPTERS: Record<Platform, FormatAdapter> = {
  linkedin: linkedinAdapter,
  telegram: telegramAdapter,
  blog: blogAdapter,
};

/** Adapter for a platform. Throws on an unknown platform. */
export function getAdapter(platform: Platform): FormatAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No format adapter for platform: ${platform}`);
  return adapter;
}

/** Convenience: adapt a source post for one platform. */
export function adaptFor(platform: Platform, post: SourcePost): AdaptedPost {
  return getAdapter(platform).adapt(post);
}

export { blogAdapter, linkedinAdapter, telegramAdapter };
export type {
  AdaptedPost,
  BlogPost,
  FormatAdapter,
  LinkedInPost,
  Platform,
  SourcePost,
  TelegramPost,
} from "./types";
