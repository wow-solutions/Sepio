import {
  coerceClientBrain,
  type Service,
  type Location,
  type PricingItem,
  type ProofItem,
  type ClientBrainFactsInput,
} from "./schema";

// Render the Client Brain facts (services / service areas / pricing / proof)
// into a brand-stable context block for the generation seam (the same
// `extraContext` array Market Brain uses). PUBLIC — this is formatting of the
// brand's OWN stored facts, no moat.
//
// The persisted values are raw `jsonb` (RLS proves ownership, not shape), so we
// re-validate each array at this read boundary (defense in depth) — malformed
// data renders nothing rather than smuggling junk into the prompt.
//
// Convention mirrors differentiation-context.ts: when there is nothing usable to
// say, return "" and the caller injects nothing (generation behaves as if Client
// Brain were never studied — no behavioral change, cache-warm prompt).

export type ClientBrainInput = ClientBrainFactsInput;

function renderBlock(
  services: Service[],
  locations: Location[],
  pricing: PricingItem[],
  proof: ProofItem[],
): string {
  const lines: string[] = [
    "# Client facts (ground every specific claim in these — never invent certifications, metrics, services, or prices)",
  ];

  if (services.length) {
    lines.push("## Services");
    for (const s of services) {
      lines.push(s.description ? `- ${s.name} — ${s.description}` : `- ${s.name}`);
    }
  }

  if (locations.length) {
    lines.push("## Service areas");
    lines.push(locations.join(", "));
  }

  if (pricing.length) {
    lines.push("## Pricing");
    for (const p of pricing) {
      lines.push(p.detail ? `- ${p.label} — ${p.detail}` : `- ${p.label}`);
    }
  }

  if (proof.length) {
    lines.push("## Proof you can cite");
    for (const item of proof) {
      const src = item.source ? ` (source: ${item.source})` : "";
      lines.push(`- [${item.kind}] ${item.body}${src}`);
    }
  }

  return lines.join("\n");
}

// Pure: raw jsonb facts -> a single Markdown block, or "" to skip. Returns ""
// when every fact array is empty or invalid. Never throws.
export function renderClientBrainBlock(input: ClientBrainInput): string {
  const { services, locations, pricing, proofItems } = coerceClientBrain(input);

  if (!services.length && !locations.length && !pricing.length && !proofItems.length) {
    return "";
  }
  return renderBlock(services, locations, pricing, proofItems);
}

// Convenience for the generate route: facts -> the `extraContext` entries.
// Empty array means "inject nothing".
export function clientBrainContextBlocks(input: ClientBrainInput): string[] {
  const block = renderClientBrainBlock(input);
  return block ? [block] : [];
}
