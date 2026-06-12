// Content Kitchen — channel contracts (frozen, shared by API + UI + resolver).
//
// A "channel" is a publish destination (posts.platform). The blog (`hosted`) is
// the FOUNDATION: one base blog article fans out to channel-specific variants.
// Each channel maps to exactly one generation FORMAT for slice 1 (multi-format
// per channel — linkedin_post vs linkedin_article, ig caption vs reel — is
// deferred). Keep this the single source of truth; the UI, the fan-out endpoint,
// and the cross-link resolver all import from here.

import type { GenFormat } from "@/lib/_private/format-specs";

export type ChannelId =
  | "hosted"
  | "linkedin"
  | "telegram"
  | "instagram"
  | "tiktok"
  | "threads"
  | "x"
  | "facebook";

export const CHANNEL_IDS: readonly ChannelId[] = [
  "hosted",
  "linkedin",
  "telegram",
  "instagram",
  "tiktok",
  "threads",
  "x",
  "facebook",
] as const;

export function isChannelId(v: string): v is ChannelId {
  return (CHANNEL_IDS as readonly string[]).includes(v);
}

// Default generation format per channel (slice 1 = one format each).
export const DEFAULT_FORMAT_BY_CHANNEL: Record<ChannelId, GenFormat> = {
  hosted: "blog",
  linkedin: "linkedin_post",
  telegram: "telegram",
  instagram: "instagram_caption",
  tiktok: "tiktok",
  threads: "threads",
  x: "x_post",
  facebook: "facebook",
};

// Display order in the channel rail — Blog (the foundation) FIRST, then by
// rough content-richness. Labels are UI-facing.
export const CHANNEL_ORDER: readonly ChannelId[] = [
  "hosted",
  "linkedin",
  "x",
  "facebook",
  "instagram",
  "threads",
  "telegram",
  "tiktok",
] as const;

export const CHANNEL_LABEL: Record<ChannelId, string> = {
  hosted: "Blog",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  telegram: "Telegram",
  tiktok: "TikTok",
};

// Two-letter rail icon glyphs (match the existing rail style).
export const CHANNEL_ICON: Record<ChannelId, string> = {
  hosted: "Bl",
  linkedin: "in",
  x: "X",
  facebook: "Fb",
  instagram: "Ig",
  threads: "Th",
  telegram: "Tg",
  tiktok: "Tt",
};

// Fullness ranking for cross-linking (owner's hierarchy): the blog/site is the
// fullest destination, then LinkedIn, then X, then IG/Facebook/Threads, then
// Telegram, then TikTok. Cross-links from a thin format point to the FULLEST
// PUBLISHED destination available. Lower number = fuller. Tunable.
export const FULLNESS_RANK: Record<ChannelId, number> = {
  hosted: 1,
  linkedin: 2,
  x: 3,
  facebook: 4,
  instagram: 5,
  threads: 6,
  telegram: 7,
  tiktok: 8,
};

// Cross-link placeholder the model may emit in a variant body. It NEVER invents
// a real URL; the resolver substitutes the primary destination URL at
// publish/export time. Keep this exact string stable across the codebase.
export const PRIMARY_URL_TOKEN = "{{PRIMARY_URL}}";
