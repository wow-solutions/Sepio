import { describe, expect, test } from "bun:test";
import { buildRefineResult } from "./refine-response";
import type { ExtractedEdit } from "./extracted-edit";

const ORIGINAL = "Most owners I talk to think automation is about speed.";
const REWRITTEN = "Last Tuesday a shop owner told me automation finally bought him time.";

const VOICE_EDIT: ExtractedEdit = {
  edit_kind: "voice_rule",
  proposed_rule: {
    rule_type: "voice_note",
    scope: "opening",
    rule_text: "Open with a concrete moment, not a generic 'Most ...' line.",
    human_label: "Concrete openers",
    rationale: "The generic opener reads as AI-written.",
  },
  proposed_fact: null,
  safety_check: { overgeneralization_risk: "low" },
};

describe("buildRefineResult", () => {
  test("rewrite OK + extract OK → full 200 result", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: true, text: REWRITTEN },
      edit: VOICE_EDIT,
    });
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.body.rewritten_post).toBe(REWRITTEN);
      expect(r.body.no_rewrite).toBe(false);
      expect(r.body.edit_kind).toBe("voice_rule");
      expect(r.body.proposed_rule?.scope).toBe("opening");
      expect(r.body.extract_failed).toBe(false);
    }
  });

  test("rewrite OK + extract FAILED → 200, diff shown, extract_failed, no rule", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: true, text: REWRITTEN },
      edit: null,
    });
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.body.rewritten_post).toBe(REWRITTEN);
      expect(r.body.extract_failed).toBe(true);
      expect(r.body.proposed_rule).toBeNull();
      expect(r.body.proposed_fact).toBeNull();
    }
  });

  test("rewrite FAILED + extract OK → 200, no_rewrite, save-rule-only", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: false },
      edit: VOICE_EDIT,
    });
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.body.rewritten_post).toBeNull();
      expect(r.body.no_rewrite).toBe(true);
      expect(r.body.proposed_rule).not.toBeNull();
      expect(r.body.extract_failed).toBe(false);
    }
  });

  test("rewrite byte-identical to source → no_rewrite even though call succeeded", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: true, text: `  ${ORIGINAL}  ` }, // trims to identical
      edit: VOICE_EDIT,
    });
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.body.rewritten_post).toBeNull();
      expect(r.body.no_rewrite).toBe(true);
      expect(r.body.proposed_rule).not.toBeNull();
    }
  });

  test("both unusable → 502 stage:extract", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: false },
      edit: null,
    });
    expect(r.status).toBe(502);
    if (r.status === 502) expect(r.body.stage).toBe("extract");
  });

  test("rewrite identical + extract failed → 502 (nothing acted)", () => {
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: true, text: ORIGINAL },
      edit: null,
    });
    expect(r.status).toBe(502);
  });

  test("one_off edit (rewrite-only) still returns 200 with null rule", () => {
    const oneOff: ExtractedEdit = {
      edit_kind: "one_off",
      proposed_rule: null,
      proposed_fact: null,
      safety_check: { overgeneralization_risk: "low" },
    };
    const r = buildRefineResult({
      originalPost: ORIGINAL,
      rewrite: { ok: true, text: REWRITTEN },
      edit: oneOff,
    });
    expect(r.status).toBe(200);
    if (r.status === 200) {
      expect(r.body.edit_kind).toBe("one_off");
      expect(r.body.rewritten_post).toBe(REWRITTEN);
      expect(r.body.proposed_rule).toBeNull();
    }
  });
});
