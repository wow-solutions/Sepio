// Lemon Squeezy webhook intake. Verifies the signature over the RAW body, guards
// store/test-mode, resolves the account, and applies an ordering-guarded sync.
//
// Response contract (matters for retries):
//   401 — bad/absent signature
//   200 — handled: either synced, or intentionally ignored (ignored event, wrong
//         store, stale, unknown variant/status, unresolvable orphan). LS treats
//         only 200 as captured, so every intentional outcome returns 200 to stop
//         retries.
//   500 — transient failure (DB/config) or not_found (provisioning lag); LS WILL
//         retry. Never 200 before the write completes.
//
// See lib/billing/lemon-squeezy.ts for the trust model.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getLemonConfig, BillingConfigError } from "@/lib/billing/config";
import {
  verifySignature,
  parseSubscriptionEvent,
  isSubscriptionEvent,
  syncSubscription,
  LemonSqueezyError,
  type ParsedSubscriptionEvent,
} from "@/lib/billing/lemon-squeezy";

export const runtime = "nodejs"; // node:crypto for HMAC verification

function ack(reason: string): Response {
  // 200: received, intentionally no action (ignored/stale/wrong-store/etc). LS
  // treats only 200 as captured and RETRIES anything else, so intentional
  // acknowledgements must be 200 — never 202 — to avoid endless retries / a
  // "failed" deliveries list. Genuine transient failures return 500 elsewhere.
  return Response.json({ received: true, reason }, { status: 200 });
}

/**
 * Resolve which account this event belongs to. subscription_created carries the
 * account_id we set at checkout; later events may omit custom_data, so fall back
 * to the subscription_id already stored on an account. Never falls back to email.
 */
async function resolveAccountId(
  event: ParsedSubscriptionEvent,
  client: ReturnType<typeof createServiceRoleClient>,
): Promise<string | null> {
  if (event.accountId) return event.accountId;
  const { data, error } = await client
    .from("accounts")
    .select("id")
    .eq("lemonsqueezy_subscription_id", event.subscriptionId)
    .maybeSingle();
  // A transient read failure must NOT look like "no account" (which 200s and is
  // never retried) — throw so the route 500s and LS retries. null only means the
  // query succeeded and found no match (a genuine orphan).
  if (error) throw new LemonSqueezyError("account lookup failed", undefined, error);
  return data?.id ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  // 1. Verify signature before touching the body. Config errors here are 500
  //    (misconfig, retryable after we fix env) not 401.
  let valid: boolean;
  try {
    valid = verifySignature(rawBody, signature);
  } catch (err) {
    if (err instanceof BillingConfigError) {
      console.error("[ls-webhook] config error:", err.message);
      return Response.json({ error: "billing not configured" }, { status: 500 });
    }
    throw err;
  }
  if (!valid) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  // 2. Parse. Non-subscription events (orders, payment invoices) are ignored —
  //    subscription_updated is our source of truth for status.
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return ack("unparseable body");
  }
  const event = parseSubscriptionEvent(body);
  if (!event) {
    const name =
      typeof body === "object" && body !== null && "meta" in body
        ? String((body as { meta?: { event_name?: unknown } }).meta?.event_name)
        : "unknown";
    return ack(isSubscriptionEvent(name) ? `unparseable ${name}` : `ignored ${name}`);
  }

  // 3. Store + test-mode guard: reject cross-store and env-mismatched deliveries.
  const cfg = getLemonConfig();
  if (event.storeId !== String(cfg.storeId)) {
    return ack("wrong store");
  }
  const expectTestMode = process.env.LEMONSQUEEZY_TEST_MODE === "true";
  if (event.testMode !== expectTestMode) {
    return ack("test_mode mismatch");
  }

  // 4. Resolve account (custom_data, then stored subscription_id). Fail closed.
  const client = createServiceRoleClient();
  const accountId = await resolveAccountId(event, client);
  if (!accountId) {
    console.error(
      `[ls-webhook] ORPHAN ${event.eventName} sub=${event.subscriptionId} ` +
        `customer=${event.customerId} — no account_id; needs manual reconcile`,
    );
    return ack("no account");
  }

  // 5. Ordering-guarded sync. Throws → 500 so LS retries.
  const outcome = await syncSubscription(event, accountId, client);
  if (!outcome.ok) {
    if (outcome.reason === "not_found") {
      // account_id resolved but no row — provisioning lag or orphan. Force a
      // retry (500) rather than silently 202'ing away a real payment.
      console.error(
        `[ls-webhook] not_found account=${accountId} sub=${event.subscriptionId} ` +
          `${event.eventName} — retrying`,
      );
      return Response.json({ error: "account not ready" }, { status: 500 });
    }
    if (outcome.reason === "unknown_variant" || outcome.reason === "unknown_status") {
      console.error(
        `[ls-webhook] ${outcome.reason} variant=${event.variantId} ` +
          `status=${event.status} sub=${event.subscriptionId} account=${accountId}`,
      );
    }
    return ack(outcome.reason);
  }
  return Response.json(
    { received: true, tier: outcome.tier, status: outcome.status },
    { status: 200 },
  );
}
