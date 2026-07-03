// Lemon Squeezy (LS) billing core — webhook verification, checkout creation,
// customer-portal fetch, and the ordering-guarded account sync.
//
// Server-only: uses LEMONSQUEEZY_API_KEY / WEBHOOK_SECRET. Never import from a
// client component.
//
// Webhook trust model (mirrors lib/data-deletion/meta-verifier.ts):
//   - LS signs each delivery: header `X-Signature` = HMAC-SHA256 hex of the RAW
//     request body using the webhook secret. We verify with a constant-time
//     compare BEFORE parsing the body. A bad signature → 401, no side effects.
//   - We then re-check the payload is from OUR store and matches the env's
//     test_mode, so a stray/test delivery can't mutate prod accounts.
//   - The account is identified ONLY by meta.custom_data.account_id (set at
//     checkout). No email fallback — emails are mutable/shared and would let a
//     payment attach to the wrong account.
//
// Subscription lifecycle events (created/updated/cancelled/expired/paused/
// resumed/unpaused) all carry the full subscription object, so a single
// syncSubscription() handles them all by writing ABSOLUTE state. Invoice/order
// events (subscription_payment_*, order_*) are intentionally ignored:
// subscription_updated is the source of truth for status, and ignoring them
// avoids a fetch-then-sync round trip.
//
// LS docs: https://docs.lemonsqueezy.com/help/webhooks
//          https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object

import crypto from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  BillingConfigError,
  getLemonConfig,
  tierForVariant,
  type PaidTier,
} from "./config";

const LS_API = "https://api.lemonsqueezy.com/v1";
const JSON_API = "application/vnd.api+json";

export class LemonSqueezyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LemonSqueezyError";
  }
}

// ─── Signature verification ─────────────────────────────────────────────────

/**
 * Verify an LS webhook signature against the raw request body. Returns true only
 * for a byte-exact HMAC-SHA256 hex match. Never throws on malformed input — a
 * forged/absent header is just `false`.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  // Reject anything that isn't clean hex up front — Buffer.from(.., "hex") would
  // silently truncate on a bad char rather than throw.
  if (!/^[0-9a-f]+$/i.test(signatureHeader)) return false;
  const { webhookSecret } = getLemonConfig();
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(signatureHeader, "hex");
  // timingSafeEqual throws on unequal lengths; the digest length is fixed so the
  // length check leaks nothing useful.
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

// ─── Status + period mapping (pure) ─────────────────────────────────────────

export type PlanStatus =
  | "active"
  | "cancelled"
  | "past_due"
  | "expired"
  | "paused"
  | "unpaid";

// LS subscription status → our plan_status. `on_trial` (paid plan inside its
// trial window) counts as active entitlement. Unknown → null so the caller
// ignores+logs rather than guessing.
const STATUS_MAP: Record<string, PlanStatus> = {
  on_trial: "active",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  paused: "paused",
  cancelled: "cancelled",
  expired: "expired",
};

export function mapStatus(lsStatus: string): PlanStatus | null {
  return STATUS_MAP[lsStatus] ?? null;
}

/**
 * The "access valid through" timestamp. For cancelled/expired subscriptions LS
 * reports the real end-of-access in `ends_at`; otherwise the next renewal is
 * `renews_at`. Either may be null.
 */
export function periodEndFor(
  status: PlanStatus,
  attrs: { renews_at: string | null; ends_at: string | null },
): string | null {
  if (status === "cancelled" || status === "expired") return attrs.ends_at;
  return attrs.renews_at;
}

// ─── Webhook payload parsing (defensive) ────────────────────────────────────

const SubscriptionWebhookSchema = z.object({
  meta: z.object({
    event_name: z.string(),
    custom_data: z.object({ account_id: z.string().min(1) }).partial().optional(),
  }),
  data: z.object({
    id: z.string().min(1), // subscription id
    attributes: z.object({
      store_id: z.union([z.number(), z.string()]),
      customer_id: z.union([z.number(), z.string()]),
      variant_id: z.union([z.number(), z.string()]),
      status: z.string(),
      test_mode: z.boolean(),
      renews_at: z.string().nullable().optional(),
      ends_at: z.string().nullable().optional(),
      updated_at: z.string(),
    }),
  }),
});

export interface ParsedSubscriptionEvent {
  eventName: string;
  accountId: string | null;
  subscriptionId: string;
  customerId: string;
  variantId: string;
  status: string;
  testMode: boolean;
  storeId: string;
  updatedAt: string;
  renewsAt: string | null;
  endsAt: string | null;
}

/** Names of LS events that carry a subscription object we sync from. */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_paused",
  "subscription_resumed",
  "subscription_unpaused",
]);

export function isSubscriptionEvent(eventName: string): boolean {
  return SUBSCRIPTION_EVENTS.has(eventName);
}

/**
 * Parse a verified webhook body into a normalized event. Returns null if the
 * shape doesn't match a subscription event (caller ignores with 202). Assumes
 * the signature has ALREADY been verified.
 */
export function parseSubscriptionEvent(body: unknown): ParsedSubscriptionEvent | null {
  const result = SubscriptionWebhookSchema.safeParse(body);
  if (!result.success) return null;
  const { meta, data } = result.data;
  // Only sync genuine lifecycle events. An invoice/order event could coincidentally
  // match the schema shape; gate on the event name so it's ignored, not applied.
  if (!isSubscriptionEvent(meta.event_name)) return null;
  const a = data.attributes;
  return {
    eventName: meta.event_name,
    accountId: meta.custom_data?.account_id ?? null,
    subscriptionId: data.id,
    customerId: String(a.customer_id),
    variantId: String(a.variant_id),
    status: a.status,
    testMode: a.test_mode,
    storeId: String(a.store_id),
    updatedAt: a.updated_at,
    renewsAt: a.renews_at ?? null,
    endsAt: a.ends_at ?? null,
  };
}

// ─── Account sync (ordering-guarded write) ──────────────────────────────────

export type SyncOutcome =
  | { ok: true; tier: PaidTier; status: PlanStatus }
  | { ok: false; reason: "unknown_variant" | "unknown_status" | "stale" | "not_found" };

/**
 * Apply a parsed subscription event to accounts via the apply_ls_subscription
 * RPC, which performs an ABSOLUTE-state write guarded ATOMICALLY against
 * out-of-order delivery (the guard lives in the UPDATE's WHERE, so concurrent
 * webhooks can't race a stale value in). The RPC returns:
 *   'applied'   → state written
 *   'stale'     → an equal/older event, or a late event for an old subscription
 *   'not_found' → no such account (orphan/provisioning lag — caller forces retry)
 * Throws on transient DB errors so the webhook route returns 500 and LS retries.
 */
export async function syncSubscription(
  event: ParsedSubscriptionEvent,
  accountId: string,
  client: SupabaseClient<Database> = createServiceRoleClient(),
): Promise<SyncOutcome> {
  const tier = tierForVariant(event.variantId);
  if (!tier) return { ok: false, reason: "unknown_variant" };
  const status = mapStatus(event.status);
  if (!status) return { ok: false, reason: "unknown_status" };

  const { data, error } = await client.rpc("apply_ls_subscription", {
    p_account_id: accountId,
    p_plan_tier: tier,
    p_plan_status: status,
    // p_period_end is timestamptz with no NOT NULL — SQL accepts null (writes a
    // nullable column) — but supabase gen can't express arg nullability, so the
    // generated type says `string`. Keep the null through a cast.
    p_period_end: periodEndFor(status, {
      renews_at: event.renewsAt,
      ends_at: event.endsAt,
    }) as unknown as string,
    p_customer_id: event.customerId,
    p_subscription_id: event.subscriptionId,
    p_updated_at: event.updatedAt,
  });
  if (error) throw new LemonSqueezyError("apply_ls_subscription failed", undefined, error);

  if (data === "applied") return { ok: true, tier, status };
  if (data === "not_found") return { ok: false, reason: "not_found" };
  return { ok: false, reason: "stale" };
}

// ─── LS REST API (checkout + portal) ────────────────────────────────────────

async function lsFetch(path: string, init: RequestInit & { method: string }): Promise<unknown> {
  const { apiKey } = getLemonConfig();
  const res = await fetch(`${LS_API}${path}`, {
    ...init,
    headers: {
      Accept: JSON_API,
      "Content-Type": JSON_API,
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new LemonSqueezyError(`LS ${init.method} ${path} → ${res.status}`, res.status, text);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LemonSqueezyError(`LS ${path} returned non-JSON`, res.status, err);
  }
}

const CheckoutResponseSchema = z.object({
  data: z.object({ attributes: z.object({ url: z.string().url() }) }),
});

/**
 * Create a hosted checkout for one paid tier and return its URL. The variant is
 * locked via enabled_variants so the user can't switch plans on the LS page, and
 * account_id is embedded as custom data — the ONLY link back to the account.
 */
export async function createCheckout(opts: {
  accountId: string;
  email: string;
  variantId: string;
  redirectUrl: string;
}): Promise<string> {
  const { storeId } = getLemonConfig();
  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: opts.email,
          custom: { account_id: opts.accountId },
        },
        product_options: {
          enabled_variants: [Number(opts.variantId)],
          redirect_url: opts.redirectUrl,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(opts.variantId) } },
      },
    },
  };
  const json = await lsFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const parsed = CheckoutResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new LemonSqueezyError("LS checkout response missing url", undefined, parsed.error);
  }
  return parsed.data.data.attributes.url;
}

const PortalResponseSchema = z.object({
  data: z.object({
    attributes: z.object({
      urls: z.object({ customer_portal: z.string().url() }).partial(),
    }),
  }),
});

/**
 * Fetch a FRESH signed customer-portal URL for a subscription (cancel / change
 * plan / update card). Signed URLs expire, so we never persist them — always
 * fetch on demand. Returns null if LS omits the portal URL.
 */
export async function getCustomerPortalUrl(subscriptionId: string): Promise<string | null> {
  const json = await lsFetch(`/subscriptions/${subscriptionId}`, { method: "GET" });
  const parsed = PortalResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.data.attributes.urls.customer_portal ?? null;
}

export { BillingConfigError };
