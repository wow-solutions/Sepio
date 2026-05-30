import { describe, expect, test } from "bun:test";
import {
  ClientBrainSchema,
  MAX_PROOF_BODY,
  ProofItemSchema,
  WordGuardsSchema,
} from "./schema";

describe("ClientBrainSchema — valid shapes", () => {
  test("accepts a fully-populated client brain", () => {
    const parsed = ClientBrainSchema.parse({
      services: [
        { name: "Nitrogen leak detection", description: "Pressurize to 42 bar" },
        { name: "Inverter AC install" },
      ],
      locations: ["Phoenix, AZ", "Tempe, AZ"],
      pricing: [
        { label: "18 BTU inverter install", detail: "4-5 month payback" },
        { label: "Diagnostic visit" },
      ],
      forbidden_claims: ["guaranteed results", "best in the city"],
      proof_items: [
        { kind: "certification", body: "NATE-certified since 2009", verifiable: true },
      ],
    });
    expect(parsed.services).toHaveLength(2);
    expect(parsed.proof_items[0].verifiable).toBe(true);
  });

  test("accepts empty arrays (nothing captured yet)", () => {
    const parsed = ClientBrainSchema.parse({
      services: [],
      locations: [],
      pricing: [],
      forbidden_claims: [],
      proof_items: [],
    });
    expect(parsed.services).toHaveLength(0);
  });
});

describe("ClientBrainSchema — malformed rejected", () => {
  const base = {
    services: [],
    locations: [],
    pricing: [],
    forbidden_claims: [],
    proof_items: [],
  };

  test("rejects a service with an empty name", () => {
    const r = ClientBrainSchema.safeParse({
      ...base,
      services: [{ name: "" }],
    });
    expect(r.success).toBe(false);
  });

  test("rejects a pricing item missing its label", () => {
    const r = ClientBrainSchema.safeParse({
      ...base,
      pricing: [{ detail: "no label" }],
    });
    expect(r.success).toBe(false);
  });

  test("rejects an empty location string", () => {
    const r = ClientBrainSchema.safeParse({ ...base, locations: [""] });
    expect(r.success).toBe(false);
  });
});

describe("ProofItemSchema", () => {
  test("rejects a kind outside the enum", () => {
    const r = ProofItemSchema.safeParse({ kind: "rumor", body: "x" });
    expect(r.success).toBe(false);
  });

  test("accepts every allowed kind", () => {
    for (const kind of [
      "certification",
      "case_study",
      "metric",
      "testimonial",
      "source_fact",
    ] as const) {
      expect(ProofItemSchema.safeParse({ kind, body: "ok" }).success).toBe(true);
    }
  });

  test("defaults verifiable to false when omitted", () => {
    const parsed = ProofItemSchema.parse({ kind: "metric", body: "30-40% lower bill" });
    expect(parsed.verifiable).toBe(false);
  });

  test("enforces the per-body length cap", () => {
    const tooLong = "a".repeat(MAX_PROOF_BODY + 1);
    expect(ProofItemSchema.safeParse({ kind: "metric", body: tooLong }).success).toBe(false);

    const atLimit = "a".repeat(MAX_PROOF_BODY);
    expect(ProofItemSchema.safeParse({ kind: "metric", body: atLimit }).success).toBe(true);
  });

  test("rejects an empty body", () => {
    expect(ProofItemSchema.safeParse({ kind: "metric", body: "   " }).success).toBe(false);
  });
});

// The split between legal claims and anti-slop tokens is a hard rule (ADR-0022,
// eng-plan C1 failure mode). A regression that merges them would let a legal
// statement become a banned token, or vice versa. Assert the keys never cross.
describe("forbidden_claims vs forbidden_words separation", () => {
  test("forbidden_claims lives only on ClientBrainSchema", () => {
    expect(ClientBrainSchema.shape).toHaveProperty("forbidden_claims");
    expect(ClientBrainSchema.shape).not.toHaveProperty("forbidden_words");
  });

  test("forbidden_words lives only on WordGuardsSchema", () => {
    expect(WordGuardsSchema.shape).toHaveProperty("forbidden_words");
    expect(WordGuardsSchema.shape).not.toHaveProperty("forbidden_claims");
  });
});
