import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { parseMetaSignedRequest, SignedRequestError } from "./meta-verifier";

const SECRET = "test-app-secret";

/** Build a valid Meta signed_request for a payload + secret. */
function sign(payloadObj: Record<string, unknown>, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${sig}.${payload}`;
}

const validPayload = { algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1716000000 };

describe("parseMetaSignedRequest", () => {
  test("parses a valid signed_request", () => {
    const out = parseMetaSignedRequest(sign(validPayload), SECRET);
    expect(out.userId).toBe("1234567890");
    expect(out.issuedAt).toBe(1716000000);
  });

  test("rejects a signature signed with the wrong secret", () => {
    const forged = sign(validPayload, "attacker-secret");
    expect(() => parseMetaSignedRequest(forged, SECRET)).toThrow(SignedRequestError);
  });

  test("rejects a tampered payload (signature no longer matches)", () => {
    const good = sign(validPayload);
    const [sig] = good.split(".");
    const swapped = Buffer.from(JSON.stringify({ ...validPayload, user_id: "9999" })).toString("base64url");
    expect(() => parseMetaSignedRequest(`${sig}.${swapped}`, SECRET)).toThrow(/signature mismatch/);
  });

  test("rejects an unexpected algorithm", () => {
    expect(() => parseMetaSignedRequest(sign({ ...validPayload, algorithm: "none" }), SECRET)).toThrow(/algorithm/);
  });

  test("rejects a missing user_id", () => {
    const { user_id, ...noUser } = validPayload;
    expect(() => parseMetaSignedRequest(sign(noUser), SECRET)).toThrow(/user_id/);
  });

  test("rejects a malformed request without a dot", () => {
    expect(() => parseMetaSignedRequest("notarealrequest", SECRET)).toThrow(/malformed/);
  });

  test("rejects when the app secret is not configured", () => {
    expect(() => parseMetaSignedRequest(sign(validPayload), "")).toThrow(/secret/);
  });
});
