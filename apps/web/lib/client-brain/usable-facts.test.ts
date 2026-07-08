import { describe, expect, test } from "bun:test";
import { countUsableFacts } from "./usable-facts";

describe("countUsableFacts", () => {
  test("empty input → 0", () => {
    expect(countUsableFacts([])).toBe(0);
  });

  test("counts metric / certification / case_study when verifiable", () => {
    const count = countUsableFacts([
      { kind: "metric", verifiable: true },
      { kind: "certification", verifiable: true },
      { kind: "case_study", verifiable: true },
    ]);
    expect(count).toBe(3);
  });

  test("verifiable=false is not counted, even for a usable kind", () => {
    const count = countUsableFacts([
      { kind: "metric", verifiable: false },
      { kind: "certification", verifiable: true },
    ]);
    expect(count).toBe(1);
  });

  test("testimonial / source_fact never count, even if verifiable", () => {
    const count = countUsableFacts([
      { kind: "testimonial", verifiable: true },
      { kind: "source_fact", verifiable: true },
    ]);
    expect(count).toBe(0);
  });

  test("unknown kind is ignored", () => {
    expect(countUsableFacts([{ kind: "bogus", verifiable: true }])).toBe(0);
  });
});
