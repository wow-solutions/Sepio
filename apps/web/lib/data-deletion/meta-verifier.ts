// Meta (Facebook/Instagram) Data Deletion Request callback — signature verifier.
// Phase 1, Lane F. Pure crypto, no I/O. The handler that cascades the actual
// deletion lives in core.ts (needs the data_deletion_requests table → after
// the Lane A migration lands + types regen).
//
// Meta posts `signed_request = base64url(sig) "." base64url(payload)` where the
// payload is JSON { algorithm: "HMAC-SHA256", user_id, ... } and `sig` is
// HMAC-SHA256(payload_part, APP_SECRET). We verify with a constant-time compare
// and only trust the payload AFTER the signature checks out.
// Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

import crypto from "node:crypto";

export class SignedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignedRequestError";
  }
}

export interface MetaSignedRequest {
  /** App-scoped user id from the verified payload. Map this to an internal user; never trust it to scan/delete by fuzzy match. */
  userId: string;
  /** Unix seconds, if Meta included `issued_at`. */
  issuedAt: number | null;
  /** Full verified payload, for callers that need more fields. */
  payload: Record<string, unknown>;
}

/**
 * Verify a Meta `signed_request` and return its payload. Throws
 * SignedRequestError on any malformed/forged input — the caller MUST treat a
 * throw as "do not delete anything" (HTTP 401, alert).
 */
export function parseMetaSignedRequest(signedRequest: string, appSecret: string): MetaSignedRequest {
  if (!appSecret) throw new SignedRequestError("app secret not configured");
  if (typeof signedRequest !== "string" || !signedRequest.includes(".")) {
    throw new SignedRequestError("malformed signed_request");
  }

  const dot = signedRequest.indexOf(".");
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedSig || !encodedPayload || encodedPayload.includes(".")) {
    throw new SignedRequestError("malformed signed_request");
  }

  const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  const provided = Buffer.from(encodedSig, "base64url");

  // Length check guards timingSafeEqual (it throws on unequal lengths); the
  // length of an HMAC-SHA256 digest is fixed, so this leaks nothing useful.
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new SignedRequestError("signature mismatch");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new SignedRequestError("invalid payload json");
  }

  if (payload.algorithm !== "HMAC-SHA256") {
    throw new SignedRequestError(`unexpected algorithm: ${String(payload.algorithm)}`);
  }
  const userId = payload.user_id;
  if (typeof userId !== "string" || !userId) {
    throw new SignedRequestError("missing user_id");
  }

  return {
    userId,
    issuedAt: typeof payload.issued_at === "number" ? payload.issued_at : null,
    payload,
  };
}
