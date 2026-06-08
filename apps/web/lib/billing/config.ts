// Lemon Squeezy (LS) billing config — server-only env reads + variant→tier map.
// No I/O. Mirrors the getConfig() pattern in lib/linkedin-oauth.ts: throw a typed
// error on missing/invalid env so callers fail loud, never silently mis-bill.

export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

// Paid tiers users can check out into. `trial` is the signup default, not
// purchasable. During early access only ONE tier is on sale (`early`, $29);
// the full agency ladder (starter/growth/agency/scale) lands when functionality
// is complete — add those keys + their VARIANT env vars here then.
export type PaidTier = "early";

export const PAID_TIERS: readonly PaidTier[] = ["early"] as const;

export function isPaidTier(value: string): value is PaidTier {
  return (PAID_TIERS as readonly string[]).includes(value);
}

interface LemonConfig {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
}

/** Secrets for the LS REST API + webhook verification. Throws if anything is missing. */
export function getLemonConfig(): LemonConfig {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!apiKey) throw new BillingConfigError("LEMONSQUEEZY_API_KEY is not configured");
  if (!storeId) throw new BillingConfigError("LEMONSQUEEZY_STORE_ID is not configured");
  if (!webhookSecret) {
    throw new BillingConfigError("LEMONSQUEEZY_WEBHOOK_SECRET is not configured");
  }
  return { apiKey, storeId, webhookSecret };
}

// Variant IDs differ per store (and between test/prod), so they live in env, not code.
// One env var per paid tier. LS sends variant_id as a number in webhook payloads and
// the checkout API wants it too — we normalise everything to string for comparison.
const TIER_ENV: Record<PaidTier, string> = {
  early: "LEMONSQUEEZY_VARIANT_EARLY",
};

/**
 * Build the variant→tier map from env. Validates each id is a non-empty positive
 * integer string and that all four are distinct (a copy-paste collision would
 * silently bill the wrong plan). Throws BillingConfigError on any problem.
 */
function buildVariantMap(): Map<string, PaidTier> {
  const map = new Map<string, PaidTier>();
  for (const tier of PAID_TIERS) {
    const raw = process.env[TIER_ENV[tier]]?.trim();
    if (!raw) throw new BillingConfigError(`${TIER_ENV[tier]} is not configured`);
    if (!/^[1-9][0-9]*$/.test(raw)) {
      throw new BillingConfigError(`${TIER_ENV[tier]} must be a positive integer id`);
    }
    if (map.has(raw)) {
      throw new BillingConfigError(`variant id ${raw} is mapped to more than one tier`);
    }
    map.set(raw, tier);
  }
  return map;
}

/** LS variant id (number or string) → paid tier, or null if it's not one of ours. */
export function tierForVariant(variantId: string | number): PaidTier | null {
  return buildVariantMap().get(String(variantId)) ?? null;
}

/** The LS variant id to check out into for a given paid tier. */
export function variantForTier(tier: PaidTier): string {
  const raw = process.env[TIER_ENV[tier]]?.trim();
  if (!raw) throw new BillingConfigError(`${TIER_ENV[tier]} is not configured`);
  // Validate the full set so a collision/typo is caught here too, not just on webhook.
  buildVariantMap();
  return raw;
}
