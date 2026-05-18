// LinkedIn OAuth 2.0 helpers (App #1 — Share on LinkedIn + Sign In OIDC).
// Server-only: uses LINKEDIN_APP1_CLIENT_SECRET. Never import from client.
//
// Flow:
//   1. /api/auth/linkedin/request → buildAuthorizeUrl(state), redirect user
//   2. LinkedIn redirects back to /api/auth/linkedin/callback?code=...&state=...
//   3. exchangeCodeForToken(code) → access_token + (optional) refresh_token
//   4. fetchUserInfo(access_token) → sub/name/email for display
//   5. Store tokens in Vault, INSERT into brand_oauth_tokens
//
// See wiki/architecture/oauth-token-storage.md and ADR-0017 D6.

import { z } from "zod";

const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

// Scopes for App #1 (Default Tier Share on LinkedIn + Standard Tier OIDC).
// w_organization_social will come from App #2 (Community Management) after approval.
export const LINKEDIN_APP1_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_member_social",
] as const;

export class LinkedInOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LinkedInOAuthError";
  }
}

interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): LinkedInConfig {
  const clientId = process.env.LINKEDIN_APP1_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_APP1_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_APP1_REDIRECT_URI;
  if (!clientId) {
    throw new LinkedInOAuthError("LINKEDIN_APP1_CLIENT_ID is not configured");
  }
  if (!clientSecret) {
    throw new LinkedInOAuthError("LINKEDIN_APP1_CLIENT_SECRET is not configured");
  }
  if (!redirectUri) {
    throw new LinkedInOAuthError("LINKEDIN_APP1_REDIRECT_URI is not configured");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_APP1_SCOPES.join(" "),
  });
  return `${LINKEDIN_AUTHORIZE_URL}?${params.toString()}`;
}

// LinkedIn token response. refresh_token is granted only if your app has
// "Programmatic Refresh Tokens" enabled (request via developer portal).
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string(),
  id_token: z.string().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

async function postForm(url: string, body: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
  } catch (err) {
    throw new LinkedInOAuthError("LinkedIn token request failed (network)", undefined, err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinkedInOAuthError(
      `LinkedIn token endpoint returned ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const raw: unknown = await res.json().catch((err) => {
    throw new LinkedInOAuthError("LinkedIn token response is not JSON", res.status, err);
  });

  const parsed = TokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LinkedInOAuthError(
      `LinkedIn token response shape unexpected: ${parsed.error.message.slice(0, 300)}`,
      res.status,
      parsed.error,
    );
  }
  return parsed.data;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  return postForm(LINKEDIN_TOKEN_URL, body);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  return postForm(LINKEDIN_TOKEN_URL, body);
}

// OIDC userinfo response (subset — LinkedIn returns more fields).
const UserInfoSchema = z.object({
  sub: z.string().min(1),
  name: z.string().min(1).optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  picture: z.string().url().optional(),
  locale: z
    .object({
      country: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
});

export type UserInfo = z.infer<typeof UserInfoSchema>;

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  let res: Response;
  try {
    res = await fetch(LINKEDIN_USERINFO_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
  } catch (err) {
    throw new LinkedInOAuthError("LinkedIn userinfo failed (network)", undefined, err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinkedInOAuthError(
      `LinkedIn userinfo returned ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const raw: unknown = await res.json().catch((err) => {
    throw new LinkedInOAuthError("LinkedIn userinfo response is not JSON", res.status, err);
  });

  const parsed = UserInfoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LinkedInOAuthError(
      `LinkedIn userinfo shape unexpected: ${parsed.error.message.slice(0, 300)}`,
      res.status,
      parsed.error,
    );
  }
  return parsed.data;
}

// ════════════════════════════════════════════════════════════════════
// State helpers (CSRF protection + brand_id passthrough)
//
// State payload: base64url JSON { nonce, brand_id }.
// The nonce is mirrored into a httpOnly cookie at /request; /callback compares.
// brand_id rides in the payload because the cookie can't reach the LinkedIn
// redirect — but the cookie still gates the whole flow.
// ════════════════════════════════════════════════════════════════════

export function encodeState(nonce: string, brandId: string): string {
  return Buffer.from(JSON.stringify({ nonce, brand_id: brandId })).toString(
    "base64url",
  );
}

const StatePayloadSchema = z.object({
  nonce: z.string().min(8),
  brand_id: z.string().uuid(),
});

export function decodeState(state: string): { nonce: string; brandId: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch (err) {
    throw new LinkedInOAuthError("state token is not valid base64url JSON", undefined, err);
  }
  const parsed = StatePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LinkedInOAuthError(
      `state payload shape unexpected: ${parsed.error.message}`,
      undefined,
      parsed.error,
    );
  }
  return { nonce: parsed.data.nonce, brandId: parsed.data.brand_id };
}
