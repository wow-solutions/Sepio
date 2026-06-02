import { describe, expect, test } from "bun:test";
import { mergeRuleWords, renderVoiceNoteBlocks } from "./rules-context";

const r = (
  rule_type: string,
  rule_text: string,
  scope: string = "global",
) => ({ rule_type, scope, rule_text });

describe("mergeRuleWords — merge + word-boundary dedup (3b)", () => {
  test("no rules + clean config → config lists unchanged (cache stays warm)", () => {
    const out = mergeRuleWords([], ["foo", "bar"], ["baz"]);
    expect(out).toEqual({ forbidden: ["foo", "bar"], required: ["baz"] });
  });

  test("null rules → config unchanged", () => {
    expect(mergeRuleWords(null, ["x"], ["y"])).toEqual({
      forbidden: ["x"],
      required: ["y"],
    });
  });

  test("forbidden_word rule + config column, same word diff case → ONE entry", () => {
    const out = mergeRuleWords([r("forbidden_word", "Most")], ["most"], []);
    expect(out.forbidden).toEqual(["most"]); // config casing kept, rule deduped
  });

  test("config first, then net-new rule words, order preserved", () => {
    const out = mergeRuleWords(
      [r("forbidden_word", "synergy"), r("forbidden_word", "leverage")],
      ["utilize"],
      [],
    );
    expect(out.forbidden).toEqual(["utilize", "synergy", "leverage"]);
  });

  test("substring is NOT deduped — 'AI' survives next to 'paid' (Codex #12)", () => {
    const out = mergeRuleWords([r("forbidden_word", "AI")], ["paid"], []);
    expect(out.forbidden).toEqual(["paid", "AI"]);
  });

  test("required_phrase merges into required list", () => {
    const out = mergeRuleWords(
      [r("required_phrase", "book a call")],
      [],
      ["free quote"],
    );
    expect(out.required).toEqual(["free quote", "book a call"]);
  });

  test("voice_note rules never leak into word lists", () => {
    const out = mergeRuleWords(
      [r("voice_note", "be punchy", "global"), r("forbidden_word", "x")],
      [],
      [],
    );
    expect(out).toEqual({ forbidden: ["x"], required: [] });
  });

  test("invalid rows dropped, never thrown", () => {
    const out = mergeRuleWords(
      [
        { rule_type: "bogus", scope: "global", rule_text: "z" },
        { rule_type: "forbidden_word", scope: "opening", rule_text: "z" }, // Cl2 violation
        { rule_type: "forbidden_word", scope: "global", rule_text: "" }, // empty
      ],
      ["keep"],
      [],
    );
    expect(out.forbidden).toEqual(["keep"]);
  });
});

describe("renderVoiceNoteBlocks — scope grouping + order", () => {
  test("empty / null → []", () => {
    expect(renderVoiceNoteBlocks(null)).toEqual([]);
    expect(renderVoiceNoteBlocks([])).toEqual([]);
  });

  test("word-type rules produce NO voice blocks", () => {
    expect(
      renderVoiceNoteBlocks([r("forbidden_word", "x"), r("required_phrase", "y")]),
    ).toEqual([]);
  });

  test("opening / body / global render as separate bullet blocks, fixed order", () => {
    const blocks = renderVoiceNoteBlocks([
      r("voice_note", "global note", "global"),
      r("voice_note", "Don't open with 'Most…'", "opening"),
      r("voice_note", "Keep paragraphs short", "body"),
    ]);
    expect(blocks).toEqual([
      "# Opening rules\n- Don't open with 'Most…'",
      "# Body rules\n- Keep paragraphs short",
      "# Voice rules\n- global note",
    ]);
  });

  test("multiple notes in one scope → multi-bullet list", () => {
    const blocks = renderVoiceNoteBlocks([
      r("voice_note", "rule one", "opening"),
      r("voice_note", "rule two", "opening"),
    ]);
    expect(blocks).toEqual(["# Opening rules\n- rule one\n- rule two"]);
  });

  test("same input → byte-identical output across calls (cache invariant)", () => {
    const input = [r("voice_note", "a", "opening"), r("voice_note", "b", "body")];
    expect(renderVoiceNoteBlocks(input)).toEqual(renderVoiceNoteBlocks(input));
  });
});
