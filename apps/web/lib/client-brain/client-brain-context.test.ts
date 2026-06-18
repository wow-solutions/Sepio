import { describe, expect, test } from "bun:test";
import {
  renderClientBrainBlock,
  clientBrainContextBlocks,
} from "./client-brain-context";

const full = {
  services: [
    { name: "AC installation", description: "Split and central systems" },
    { name: "Maintenance" },
  ],
  locations: ["Panama City", "Colón"],
  pricing: [{ label: "Service visit", detail: "from $50" }],
  proofItems: [
    { kind: "certification", body: "Daikin certified installer", source: "https://x/cert", verifiable: true },
    { kind: "metric", body: "2000+ units installed" },
  ],
};

describe("renderClientBrainBlock", () => {
  test("renders a # Client facts block with every section", () => {
    const block = renderClientBrainBlock(full);
    expect(block.startsWith("# Client facts")).toBe(true);
    expect(block).toContain("## Services");
    expect(block).toContain("- AC installation — Split and central systems");
    expect(block).toContain("- Maintenance");
    expect(block).toContain("## Service areas");
    expect(block).toContain("Panama City, Colón");
    expect(block).toContain("## Pricing");
    expect(block).toContain("- Service visit — from $50");
    expect(block).toContain("## Proof you can cite");
    expect(block).toContain("[certification] Daikin certified installer (source: https://x/cert)");
    expect(block).toContain("[metric] 2000+ units installed");
  });

  test("proof without a source omits the source suffix", () => {
    const block = renderClientBrainBlock({
      services: [],
      locations: [],
      pricing: [],
      proofItems: [{ kind: "metric", body: "98% on-time" }],
    });
    expect(block).toContain("[metric] 98% on-time");
    expect(block).not.toContain("(source:");
  });

  test("all-empty facts render \"\" → no block injected", () => {
    const empty = { services: [], locations: [], pricing: [], proofItems: [] };
    expect(renderClientBrainBlock(empty)).toBe("");
    expect(clientBrainContextBlocks(empty)).toEqual([]);
  });

  test("invalid jsonb (wrong shape) renders \"\" rather than smuggling junk", () => {
    const junk = {
      services: "not an array",
      locations: [123, {}],
      pricing: null,
      proofItems: [{ kind: "bogus_kind", body: "x" }],
    };
    expect(renderClientBrainBlock(junk)).toBe("");
  });

  test("drops malformed entries but keeps valid ones", () => {
    const mixed = {
      services: [{ name: "Repair" }, { description: "no name" }],
      locations: ["Panama", ""],
      pricing: [],
      proofItems: [],
    };
    const block = renderClientBrainBlock(mixed);
    expect(block).toContain("- Repair");
    expect(block).toContain("Panama");
  });

  test("clientBrainContextBlocks wraps a non-empty block in a single-element array", () => {
    expect(clientBrainContextBlocks(full)).toHaveLength(1);
  });
});
