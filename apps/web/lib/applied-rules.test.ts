import { describe, expect, test } from "bun:test";
import { coerceAppliedRules } from "./applied-rules";

// Read-boundary semantics of posts.applied_rules (W2, null ≠ []):
// non-array (incl. the pre-W2 null) → null "not tracked"; array → valid items.

describe("coerceAppliedRules", () => {
  test("null / undefined / non-array → null (not tracked, no receipt)", () => {
    expect(coerceAppliedRules(null)).toBeNull();
    expect(coerceAppliedRules(undefined)).toBeNull();
    expect(coerceAppliedRules("[]")).toBeNull();
    expect(coerceAppliedRules({})).toBeNull();
    expect(coerceAppliedRules(42)).toBeNull();
  });

  test("[] stays [] (tracked, zero applied → teach-CTA)", () => {
    expect(coerceAppliedRules([])).toEqual([]);
  });

  test("keeps well-shaped items, drops malformed ones", () => {
    const good = {
      id: "r-1",
      rule_type: "voice_note",
      scope: "global",
      label: "Voice",
    };
    expect(
      coerceAppliedRules([
        good,
        { id: 5, rule_type: "voice_note", scope: "global", label: "bad id" },
        { rule_type: "voice_note", scope: "global", label: "no id" },
        "junk",
        null,
      ]),
    ).toEqual([good]);
  });

  test("unknown rule_type/scope strings survive (snapshot outlives renames)", () => {
    const future = {
      id: "r-2",
      rule_type: "tone_rule",
      scope: "headline",
      label: "Future kind",
    };
    expect(coerceAppliedRules([future])).toEqual([future]);
  });
});
