import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { PublishAdapter, PublishablePost, PublishContext } from "./types";

// Vault is a hard dependency of the adapter; mock it so readSecret is
// configurable per-test. Dynamic-import the adapter in beforeAll so the mock is
// registered before the module under test is evaluated.
const vaultState: { value: unknown; throwErr: Error | null } = { value: null, throwErr: null };
mock.module("@/lib/vault", () => ({
  readSecret: async () => {
    if (vaultState.throwErr) throw vaultState.throwErr;
    return vaultState.value;
  },
  VaultError: class VaultError extends Error {},
}));

let wordPressAdapter: PublishAdapter;
let validateWordPressCredential: (typeof import("./wordpress"))["validateWordPressCredential"];

beforeAll(async () => {
  const mod = await import("./wordpress");
  wordPressAdapter = mod.wordPressAdapter;
  validateWordPressCredential = mod.validateWordPressCredential;
});

const VALID_CRED = { site_url: "https://wp.example.com", username: "u", app_password: "pw" };
const publicLookup = async () => [{ address: "93.184.216.34" }];
const privateLookup = async () => [{ address: "10.0.0.1" }];

const BASE_POST: PublishablePost = {
  id: "00000000-0000-0000-0000-000000000001",
  brand_id: "b1",
  platform: "wordpress",
  language: "en",
  title: "Hello",
  slug: null,
  excerpt: null,
  content_text: "Body",
  content_markdown: null,
  cover_image_url: null,
  cover_image_alt: null,
};

function makeCtx(over: {
  post?: Partial<PublishablePost>;
  config?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  lookup?: (h: string) => Promise<{ address: string }[]>;
}): PublishContext {
  return {
    post: { ...BASE_POST, ...over.post },
    brandId: "b1",
    config: over.config ?? { vaultSecretId: "vs1" },
    fetchImpl: over.fetchImpl,
    lookup: over.lookup ?? publicLookup,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("wordPressAdapter.publish — input/credential guards", () => {
  test("empty title → 400 (before any Vault/fetch)", async () => {
    const out = await wordPressAdapter.publish(makeCtx({ post: { title: "  " } }));
    expect(out).toEqual({ ok: false, status: 400, message: "Article title required" });
  });

  test("missing vaultSecretId → 401 needsReconnect", async () => {
    const out = await wordPressAdapter.publish(makeCtx({ config: {} }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.needsReconnect).toBe(true);
    }
  });

  test("Vault returns null → 401 needsReconnect", async () => {
    vaultState.value = null;
    vaultState.throwErr = null;
    const out = await wordPressAdapter.publish(makeCtx({}));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.needsReconnect).toBe(true);
  });

  test("malformed credential → 401 needsReconnect", async () => {
    vaultState.value = { not: "a credential" };
    const out = await wordPressAdapter.publish(makeCtx({}));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.needsReconnect).toBe(true);
    }
  });
});

describe("wordPressAdapter.publish — SSRF + HTTP mapping", () => {
  test("private site URL rejected before fetch", async () => {
    vaultState.value = VALID_CRED;
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const out = await wordPressAdapter.publish(makeCtx({ fetchImpl, lookup: privateLookup }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
    expect(fetched).toBe(false);
  });

  test("201 with id+link → ok", async () => {
    vaultState.value = VALID_CRED;
    const fetchImpl = (async () =>
      jsonResponse({ id: 7, link: "https://wp.example.com/?p=7" }, 201)) as unknown as typeof fetch;
    const out = await wordPressAdapter.publish(makeCtx({ fetchImpl }));
    expect(out).toEqual({ ok: true, externalId: "7", externalUrl: "https://wp.example.com/?p=7" });
  });

  test("401 from WP → needsReconnect", async () => {
    vaultState.value = VALID_CRED;
    const fetchImpl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const out = await wordPressAdapter.publish(makeCtx({ fetchImpl }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.needsReconnect).toBe(true);
    }
  });

  test("5xx → server error mapped to same status", async () => {
    vaultState.value = VALID_CRED;
    const fetchImpl = (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
    const out = await wordPressAdapter.publish(makeCtx({ fetchImpl }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(503);
  });

  test("unhandled status does NOT leak the remote body (R-12)", async () => {
    vaultState.value = VALID_CRED;
    const secretBody = "Fatal error at /var/www/secret-plugin/db.php SECRETLEAK";
    const fetchImpl = (async () => new Response(secretBody, { status: 418 })) as unknown as typeof fetch;
    const out = await wordPressAdapter.publish(makeCtx({ fetchImpl }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(418);
      expect(out.message).not.toContain("SECRETLEAK");
      expect(out.message).not.toContain("/var/www");
      expect(out.message).toContain("418");
    }
  });
});

describe("validateWordPressCredential", () => {
  test("200 → true", async () => {
    const fetchImpl = (async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    expect(await validateWordPressCredential(VALID_CRED, { fetchImpl, lookup: publicLookup })).toBe(true);
  });

  test("401 → false", async () => {
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    expect(await validateWordPressCredential(VALID_CRED, { fetchImpl, lookup: publicLookup })).toBe(false);
  });

  test("private URL → false (no fetch)", async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await validateWordPressCredential(VALID_CRED, { fetchImpl, lookup: privateLookup })).toBe(false);
    expect(fetched).toBe(false);
  });
});
