import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createCheckout,
  isSubscriptionEvent,
  mapStatus,
  parseSubscriptionEvent,
  periodEndFor,
  syncSubscription,
  verifySignature,
  type ParsedSubscriptionEvent,
} from "./lemon-squeezy";

const SECRET = "whooks_secret";

const ENV_KEYS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_VARIANT_EARLY",
];
const saved: Record<string, string | undefined> = {};
const savedFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.LEMONSQUEEZY_API_KEY = "key";
  process.env.LEMONSQUEEZY_STORE_ID = "99";
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
  process.env.LEMONSQUEEZY_VARIANT_EARLY = "111";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = savedFetch;
});

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

describe("verifySignature", () => {
  test("accepts a correct hex signature", () => {
    const body = '{"hello":"world"}';
    expect(verifySignature(body, sign(body))).toBe(true);
  });
  test("rejects a tampered body", () => {
    const body = '{"hello":"world"}';
    expect(verifySignature('{"hello":"evil"}', sign(body))).toBe(false);
  });
  test("rejects an absent header", () => {
    expect(verifySignature("x", null)).toBe(false);
  });
  test("rejects wrong-length signature without throwing", () => {
    expect(verifySignature("x", "ab")).toBe(false);
  });
  test("rejects non-hex signature", () => {
    expect(verifySignature("x", "zz".repeat(32))).toBe(false);
  });
});

describe("mapStatus", () => {
  test("maps known LS statuses", () => {
    expect(mapStatus("on_trial")).toBe("active");
    expect(mapStatus("active")).toBe("active");
    expect(mapStatus("past_due")).toBe("past_due");
    expect(mapStatus("unpaid")).toBe("unpaid");
    expect(mapStatus("paused")).toBe("paused");
    expect(mapStatus("cancelled")).toBe("cancelled");
    expect(mapStatus("expired")).toBe("expired");
  });
  test("returns null for unknown status", () => {
    expect(mapStatus("frozen")).toBeNull();
  });
});

describe("periodEndFor", () => {
  test("uses ends_at for cancelled/expired", () => {
    expect(periodEndFor("cancelled", { renews_at: "R", ends_at: "E" })).toBe("E");
    expect(periodEndFor("expired", { renews_at: "R", ends_at: null })).toBeNull();
  });
  test("uses renews_at otherwise", () => {
    expect(periodEndFor("active", { renews_at: "R", ends_at: "E" })).toBe("R");
    expect(periodEndFor("past_due", { renews_at: null, ends_at: "E" })).toBeNull();
  });
});

describe("isSubscriptionEvent", () => {
  test("true for lifecycle events", () => {
    expect(isSubscriptionEvent("subscription_created")).toBe(true);
    expect(isSubscriptionEvent("subscription_paused")).toBe(true);
  });
  test("false for invoice/order events", () => {
    expect(isSubscriptionEvent("subscription_payment_success")).toBe(false);
    expect(isSubscriptionEvent("order_created")).toBe(false);
  });
});

function webhook(
  over: Record<string, unknown> = {},
  eventName = "subscription_created",
): unknown {
  return {
    meta: { event_name: eventName, custom_data: { account_id: "acc-1" } },
    data: {
      id: "sub-1",
      attributes: {
        store_id: 99,
        customer_id: 7,
        variant_id: 111,
        status: "active",
        test_mode: false,
        renews_at: "2026-07-01T00:00:00Z",
        ends_at: null,
        updated_at: "2026-06-07T00:00:00Z",
        ...over,
      },
    },
  };
}

describe("parseSubscriptionEvent", () => {
  test("normalises a valid payload (numbers → strings)", () => {
    const e = parseSubscriptionEvent(webhook());
    expect(e).not.toBeNull();
    expect(e!.accountId).toBe("acc-1");
    expect(e!.subscriptionId).toBe("sub-1");
    expect(e!.customerId).toBe("7");
    expect(e!.variantId).toBe("111");
    expect(e!.storeId).toBe("99");
    expect(e!.testMode).toBe(false);
  });
  test("accountId null when custom_data absent", () => {
    const body = webhook();
    delete (body as { meta: { custom_data?: unknown } }).meta.custom_data;
    expect(parseSubscriptionEvent(body)!.accountId).toBeNull();
  });
  test("returns null on a malformed payload", () => {
    expect(parseSubscriptionEvent({ meta: {}, data: {} })).toBeNull();
    expect(parseSubscriptionEvent("nope")).toBeNull();
  });
  test("returns null for a non-lifecycle event even if the shape matches", () => {
    expect(parseSubscriptionEvent(webhook({}, "subscription_payment_success"))).toBeNull();
    expect(parseSubscriptionEvent(webhook({}, "order_created"))).toBeNull();
  });
});

// ── syncSubscription with a fake Supabase client (mocks the apply_ls_subscription RPC) ──
type FakeOpts = { rpcResult?: string; rpcError?: unknown };
function fakeClient(opts: FakeOpts) {
  const captured: { fn?: string; args?: Record<string, unknown> } = {};
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      captured.fn = fn;
      captured.args = args;
      return Promise.resolve({ data: opts.rpcResult ?? null, error: opts.rpcError ?? null });
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, captured };
}

const baseEvent: ParsedSubscriptionEvent = {
  eventName: "subscription_created",
  accountId: "acc-1",
  subscriptionId: "sub-1",
  customerId: "7",
  variantId: "111",
  status: "active",
  testMode: false,
  storeId: "99",
  updatedAt: "2026-06-07T00:00:00Z",
  renewsAt: "2026-07-01T00:00:00Z",
  endsAt: null,
};

describe("syncSubscription", () => {
  test("applies and passes mapped fields to the RPC", async () => {
    const { client, captured } = fakeClient({ rpcResult: "applied" });
    const out = await syncSubscription(baseEvent, "acc-1", client);
    expect(out).toEqual({ ok: true, tier: "early", status: "active" });
    expect(captured.fn).toBe("apply_ls_subscription");
    expect(captured.args).toMatchObject({
      p_account_id: "acc-1",
      p_plan_tier: "early",
      p_plan_status: "active",
      p_period_end: "2026-07-01T00:00:00Z",
      p_subscription_id: "sub-1",
      p_updated_at: "2026-06-07T00:00:00Z",
    });
  });
  test("unknown variant → no RPC call", async () => {
    const { client, captured } = fakeClient({ rpcResult: "applied" });
    const out = await syncSubscription({ ...baseEvent, variantId: "999" }, "acc-1", client);
    expect(out).toEqual({ ok: false, reason: "unknown_variant" });
    expect(captured.fn).toBeUndefined();
  });
  test("unknown status → no RPC call", async () => {
    const { client, captured } = fakeClient({ rpcResult: "applied" });
    const out = await syncSubscription({ ...baseEvent, status: "frozen" }, "acc-1", client);
    expect(out).toEqual({ ok: false, reason: "unknown_status" });
    expect(captured.fn).toBeUndefined();
  });
  test("RPC 'not_found' → not_found", async () => {
    const { client } = fakeClient({ rpcResult: "not_found" });
    const out = await syncSubscription(baseEvent, "acc-1", client);
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });
  test("RPC 'stale' → stale", async () => {
    const { client } = fakeClient({ rpcResult: "stale" });
    const out = await syncSubscription(baseEvent, "acc-1", client);
    expect(out).toEqual({ ok: false, reason: "stale" });
  });
  test("passes ends_at as period end for cancelled", async () => {
    const { client, captured } = fakeClient({ rpcResult: "applied" });
    const out = await syncSubscription(
      { ...baseEvent, status: "cancelled", endsAt: "2026-07-15T00:00:00Z" },
      "acc-1",
      client,
    );
    expect(out).toMatchObject({ ok: true, status: "cancelled" });
    expect(captured.args).toMatchObject({ p_period_end: "2026-07-15T00:00:00Z" });
  });
  test("throws on RPC error (→ 500 upstream → LS retries)", async () => {
    const { client } = fakeClient({ rpcError: { message: "boom" } });
    await expect(syncSubscription(baseEvent, "acc-1", client)).rejects.toThrow(
      /apply_ls_subscription failed/,
    );
  });
});

describe("createCheckout", () => {
  test("posts JSON:API and returns the checkout url", async () => {
    let captured: { url: string; body: unknown } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(String(init.body)) };
      return new Response(
        JSON.stringify({ data: { attributes: { url: "https://lemon.checkout/xyz" } } }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;
    const url = await createCheckout({
      accountId: "acc-1",
      email: "u@example.com",
      variantId: "333",
      redirectUrl: "https://sepio.app/dashboard",
    });
    expect(url).toBe("https://lemon.checkout/xyz");
    expect(captured!.url).toContain("/checkouts");
    expect((captured!.body as { data: { attributes: { product_options: { enabled_variants: number[] } } } }).data.attributes.product_options.enabled_variants).toEqual([333]);
  });
  test("throws on LS API error", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    await expect(
      createCheckout({ accountId: "a", email: "e@e.com", variantId: "1", redirectUrl: "u" }),
    ).rejects.toThrow(/422/);
  });
});
