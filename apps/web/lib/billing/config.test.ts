import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BillingConfigError,
  getLemonConfig,
  isPaidTier,
  tierForVariant,
  variantForTier,
} from "./config";

const ENV_KEYS = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_VARIANT_EARLY",
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isPaidTier", () => {
  test("accepts the early-access tier", () => {
    expect(isPaidTier("early")).toBe(true);
  });
  test("rejects trial, future-ladder names, and junk", () => {
    expect(isPaidTier("trial")).toBe(false);
    expect(isPaidTier("agency")).toBe(false);
    expect(isPaidTier("")).toBe(false);
  });
});

describe("getLemonConfig", () => {
  test("returns secrets when all present", () => {
    process.env.LEMONSQUEEZY_API_KEY = "key";
    process.env.LEMONSQUEEZY_STORE_ID = "99";
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "sek";
    expect(getLemonConfig()).toEqual({ apiKey: "key", storeId: "99", webhookSecret: "sek" });
  });
  test("throws on missing secret", () => {
    delete process.env.LEMONSQUEEZY_API_KEY;
    process.env.LEMONSQUEEZY_STORE_ID = "99";
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "sek";
    expect(() => getLemonConfig()).toThrow(BillingConfigError);
  });
});

describe("tierForVariant", () => {
  test("maps the configured variant id to early (number or string)", () => {
    process.env.LEMONSQUEEZY_VARIANT_EARLY = "1761123";
    expect(tierForVariant("1761123")).toBe("early");
    expect(tierForVariant(1761123)).toBe("early");
  });
  test("returns null for an unknown variant", () => {
    process.env.LEMONSQUEEZY_VARIANT_EARLY = "1761123";
    expect(tierForVariant("999")).toBeNull();
  });
  test("throws when the variant env is missing", () => {
    delete process.env.LEMONSQUEEZY_VARIANT_EARLY;
    expect(() => tierForVariant("1761123")).toThrow(BillingConfigError);
  });
  test("throws on a non-numeric variant id", () => {
    process.env.LEMONSQUEEZY_VARIANT_EARLY = "abc";
    expect(() => tierForVariant("1761123")).toThrow(/positive integer/);
  });
});

describe("variantForTier", () => {
  test("returns the configured id", () => {
    process.env.LEMONSQUEEZY_VARIANT_EARLY = "1761123";
    expect(variantForTier("early")).toBe("1761123");
  });
  test("throws when its env is missing", () => {
    delete process.env.LEMONSQUEEZY_VARIANT_EARLY;
    expect(() => variantForTier("early")).toThrow(BillingConfigError);
  });
});
