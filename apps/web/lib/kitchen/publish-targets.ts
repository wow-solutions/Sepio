// Publish destination picker — pure helpers (no React, no I/O), so the fan-out
// gating and ordering are unit-testable independent of the writer component.

import { PUBLISH_LIVE, type ChannelId } from "./channel-formats";

export type ConnectionFlags = {
  hasBlogDomain: boolean; // blog publishes only to a connected own-domain
  hasLinkedIn: boolean; // LinkedIn publishes only with an active OAuth token
};

// Why a channel can't be a publish target (drives the picker's inline hint).
export type PublishReason = "soon" | "domain" | "linkedin" | null;

// A channel is publishable when its adapter is LIVE and the brand is CONNECTED
// for it. Channels without an adapter ("soon") are never publishable.
export function isPublishable(c: ChannelId, f: ConnectionFlags): boolean {
  if (!PUBLISH_LIVE[c]) return false;
  if (c === "hosted") return f.hasBlogDomain;
  if (c === "linkedin") return f.hasLinkedIn;
  return false;
}

export function publishReason(c: ChannelId, f: ConnectionFlags): PublishReason {
  if (!PUBLISH_LIVE[c]) return "soon";
  if (c === "hosted" && !f.hasBlogDomain) return "domain";
  if (c === "linkedin" && !f.hasLinkedIn) return "linkedin";
  return null;
}

// Blog FIRST so a social variant's {{PRIMARY_URL}} resolves to the live article
// (the social publish reads the hosted sibling's external_post_url). Order among
// social channels is irrelevant. Stable, non-mutating.
export function orderForFanout(channels: ChannelId[]): ChannelId[] {
  return [...channels].sort((a, b) =>
    a === "hosted" ? -1 : b === "hosted" ? 1 : 0,
  );
}
