import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  readLinkedInToken,
  updateSecret,
  VaultError,
  type LinkedInToken,
} from "@/lib/vault";
import { publishMemberPost, LinkedInApiError } from "@/lib/linkedin-api";
import {
  refreshAccessToken,
  fetchUserInfo,
  LinkedInOAuthError,
} from "@/lib/linkedin-oauth";
import type { PublishOutcome } from "./types";

// LinkedIn publish flow, extracted verbatim from the publish route so the
// dispatcher can treat every destination uniformly. Behavior is unchanged:
//   1. find the brand's LinkedIn token row (service-role)
//   2. read token from Vault, refresh if near expiry (write back)
//   3. backfill user_sub if missing (write back)
//   4. POST to LinkedIn /v2/ugcPosts
// Returns the outcome plus the oauth_token_id (for publish_attempts auditing).

const REFRESH_BUFFER_MS = 60_000; // refresh if expiring within 1 minute

export interface LinkedInPublishResult {
  outcome: PublishOutcome;
  oauthTokenId: string | null;
}

export async function publishToLinkedIn(params: {
  brandId: string;
  contentText: string;
}): Promise<LinkedInPublishResult> {
  const { brandId, contentText } = params;

  const service = createServiceRoleClient();
  const { data: tokenRow } = await service
    .from("brand_oauth_tokens")
    .select("id, vault_secret_id, expires_at, status")
    .eq("brand_id", brandId)
    .eq("platform", "linkedin")
    .maybeSingle();

  if (!tokenRow || !tokenRow.vault_secret_id) {
    return {
      outcome: {
        ok: false,
        status: 400,
        message: "LinkedIn is not connected for this brand",
        needsReconnect: true,
      },
      oauthTokenId: null,
    };
  }
  const oauthTokenId = tokenRow.id;
  if (tokenRow.status !== "active") {
    return {
      outcome: {
        ok: false,
        status: 400,
        message: `LinkedIn connection status is ${tokenRow.status}`,
        needsReconnect: true,
      },
      oauthTokenId,
    };
  }

  // Read token from Vault
  let token: LinkedInToken;
  try {
    token = await readLinkedInToken(tokenRow.vault_secret_id);
  } catch (err) {
    const msg = err instanceof VaultError ? err.message : "Vault read failed";
    return { outcome: { ok: false, status: 500, message: msg }, oauthTokenId };
  }

  // Refresh if near expiry
  const expiresMs = new Date(token.expires_at).getTime();
  if (Number.isFinite(expiresMs) && expiresMs - Date.now() < REFRESH_BUFFER_MS) {
    if (!token.refresh_token) {
      return {
        outcome: {
          ok: false,
          status: 401,
          message: "LinkedIn token expired and no refresh token available",
          needsReconnect: true,
        },
        oauthTokenId,
      };
    }
    try {
      const refreshed = await refreshAccessToken(token.refresh_token);
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      token = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? token.refresh_token,
        expires_at: newExpiresAt,
        scope: refreshed.scope,
        user_sub: token.user_sub,
      };
      await updateSecret(tokenRow.vault_secret_id, { ...token });
      await service
        .from("brand_oauth_tokens")
        .update({ expires_at: newExpiresAt })
        .eq("id", tokenRow.id);
    } catch (err) {
      const msg = err instanceof LinkedInOAuthError ? err.message : "Token refresh failed";
      return {
        outcome: { ok: false, status: 401, message: msg, needsReconnect: true },
        oauthTokenId,
      };
    }
  }

  // Backfill user_sub for tokens issued before that field existed
  let sub = token.user_sub;
  if (!sub) {
    try {
      const userInfo = await fetchUserInfo(token.access_token);
      sub = userInfo.sub;
      token = { ...token, user_sub: sub };
      await updateSecret(tokenRow.vault_secret_id, { ...token });
    } catch (err) {
      const msg =
        err instanceof LinkedInOAuthError ? err.message : "Failed to fetch LinkedIn profile";
      return {
        outcome: { ok: false, status: 401, message: msg, needsReconnect: true },
        oauthTokenId,
      };
    }
  }

  // Publish
  try {
    const result = await publishMemberPost(token.access_token, sub, contentText);
    return {
      outcome: { ok: true, externalId: result.urn, externalUrl: result.url },
      oauthTokenId,
    };
  } catch (err) {
    const msg = err instanceof LinkedInApiError ? err.message : "LinkedIn publish failed";
    const status = err instanceof LinkedInApiError && err.status === 401 ? 401 : 502;
    return {
      outcome: { ok: false, status, message: msg, needsReconnect: status === 401 },
      oauthTokenId,
    };
  }
}
