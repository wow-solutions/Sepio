import { z } from "zod";

// PUBLIC validation boundary for Client Brain. The brand's own business facts —
// services, service areas, pricing markers, and discrete proof items — extracted
// from the client's website and used to GROUND generation (so content cites real
// specifics instead of inventing them). Mirror-safe: this is shape/validation
// only, no moat. The extractor (_private) emits this shape; the persist layer and
// the generation context block both re-validate against it (defense in depth —
// jsonb columns are structurally untyped).

// proof_items.body cap — matches the migration comment (~2000 chars per item).
export const MAX_PROOF_BODY = 2000;

// Per-array caps so an oversized extraction can't bloat the prompt or the DB.
export const MAX_SERVICES = 20;
export const MAX_LOCATIONS = 20;
export const MAX_PRICING = 20;
export const MAX_PROOF_ITEMS = 20;

export const ServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const LocationSchema = z.string().min(1);

export const PricingItemSchema = z.object({
  label: z.string().min(1),
  detail: z.string().optional(),
});

// `kind` mirrors the proof_items CHECK constraint exactly (migration
// 20260530120000). `asset_url` is intentionally omitted — the extractor cannot
// produce a private Storage asset, that is a manual upload (out of scope v1).
export const ProofItemSchema = z.object({
  kind: z.enum([
    "certification",
    "case_study",
    "metric",
    "testimonial",
    "source_fact",
  ]),
  body: z.string().min(1).max(MAX_PROOF_BODY),
  source: z.string().nullish(),
  verifiable: z.boolean().default(false),
});

export const ClientBrainSchema = z.object({
  services: z.array(ServiceSchema),
  locations: z.array(LocationSchema),
  pricing: z.array(PricingItemSchema),
  proof_items: z.array(ProofItemSchema),
});

export type Service = z.infer<typeof ServiceSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type PricingItem = z.infer<typeof PricingItemSchema>;
export type ProofItem = z.infer<typeof ProofItemSchema>;
export type ClientBrain = z.infer<typeof ClientBrainSchema>;

export type ClientBrainFactsInput = {
  services: unknown;
  locations: unknown;
  pricing: unknown;
  proofItems: unknown;
};

export type ClientBrainFacts = {
  services: Service[];
  locations: Location[];
  pricing: PricingItem[];
  proofItems: ProofItem[];
};

// Validate raw jsonb facts at a read boundary (the persisted columns are
// structurally untyped — RLS proves ownership, not shape). Drops individual
// malformed entries rather than failing the whole set, so one bad row can't
// erase every fact. Shared by the generation context block and the brand-page
// display.
function coerceArray<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function coerceClientBrain(input: ClientBrainFactsInput): ClientBrainFacts {
  return {
    services: coerceArray(input.services, ServiceSchema),
    locations: coerceArray(input.locations, LocationSchema),
    pricing: coerceArray(input.pricing, PricingItemSchema),
    proofItems: coerceArray(input.proofItems, ProofItemSchema),
  };
}
