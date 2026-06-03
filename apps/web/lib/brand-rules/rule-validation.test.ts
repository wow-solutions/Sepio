import { describe, expect, test } from "bun:test";
import {
  tokenMatch,
  findRuleConflict,
  ApplyRuleSchema,
  type ConflictableRule,
} from "./rule-validation";

describe("tokenMatch", () => {
  test("word needle matches on token boundaries", () => {
    expect(tokenMatch("Most owners I talk to", "most")).toBe(true);
    expect(tokenMatch("we value clarity", "Clarity")).toBe(true); // case-insensitive
  });

  test("word needle does NOT match inside another word (Codex #12)", () => {
    expect(tokenMatch("paid media", "AI")).toBe(false);
    expect(tokenMatch("microservice", "CRM")).toBe(false);
  });

  test("symbol needle matches as a substring (no word boundary)", () => {
    expect(tokenMatch("use a -> b arrows", "->")).toBe(true);
    expect(tokenMatch("a->b", "->")).toBe(true);
  });

  test("empty needle never matches", () => {
    expect(tokenMatch("anything", "  ")).toBe(false);
  });
});

describe("findRuleConflict", () => {
  const required = (text: string): ConflictableRule => ({
    rule_type: "required_phrase",
    rule_text: text,
    human_label: text,
  });
  const forbidden = (text: string): ConflictableRule => ({
    rule_type: "forbidden_word",
    rule_text: text,
    human_label: text,
  });

  test("new forbidden word that appears in an existing required phrase conflicts", () => {
    const hit = findRuleConflict(forbidden("clarity"), [
      required("we deliver clarity and speed"),
    ]);
    expect(hit).not.toBeNull();
  });

  test("new required phrase containing an existing forbidden word conflicts", () => {
    const hit = findRuleConflict(required("book a free demo today"), [
      forbidden("demo"),
    ]);
    expect(hit).not.toBeNull();
  });

  test("no conflict when the word only appears as a substring", () => {
    // "AI" forbidden must NOT conflict with required phrase "paid plans".
    expect(findRuleConflict(forbidden("AI"), [required("paid plans")])).toBeNull();
  });

  test("same-type rules never conflict (voice_note punted in v1)", () => {
    expect(
      findRuleConflict(
        { rule_type: "voice_note", rule_text: "open with a number" },
        [{ rule_type: "voice_note", rule_text: "open with a question" }],
      ),
    ).toBeNull();
  });

  test("forbidden vs forbidden does not conflict", () => {
    expect(findRuleConflict(forbidden("synergy"), [forbidden("synergy")])).toBeNull();
  });
});

describe("ApplyRuleSchema", () => {
  test("accepts a valid voice_note with an opening scope", () => {
    const r = ApplyRuleSchema.safeParse({
      rule_type: "voice_note",
      scope: "opening",
      rule_text: "open with a concrete moment",
      human_label: "Concrete openers",
    });
    expect(r.success).toBe(true);
  });

  test("rejects a forbidden_word with a non-global scope (Cl2)", () => {
    const r = ApplyRuleSchema.safeParse({
      rule_type: "forbidden_word",
      scope: "opening",
      rule_text: "synergy",
      human_label: "Ban synergy",
    });
    expect(r.success).toBe(false);
  });

  test("rejects empty rule_text", () => {
    const r = ApplyRuleSchema.safeParse({
      rule_type: "voice_note",
      scope: "global",
      rule_text: "   ",
      human_label: "x",
    });
    expect(r.success).toBe(false);
  });
});
