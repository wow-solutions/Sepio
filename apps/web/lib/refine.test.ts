import { describe, expect, test } from "bun:test";
import { buildRefineUserText } from "./claude";

const POST = "Most owners I talk to think automation is about speed.";
const INSTR = "Don't open with 'Most owners I talk to'.";

describe("buildRefineUserText", () => {
  test("includes both the instruction and the current post", () => {
    const out = buildRefineUserText(POST, INSTR);
    expect(out).toContain(INSTR);
    expect(out).toContain(POST);
  });

  test("instruction comes before the post (model reads the ask first)", () => {
    const out = buildRefineUserText(POST, INSTR);
    expect(out.indexOf("INSTRUCTION:")).toBeLessThan(out.indexOf("CURRENT POST:"));
    expect(out.indexOf(INSTR)).toBeLessThan(out.indexOf(POST));
  });

  test("reminds the model to honor system-prompt rules (don't undo memory)", () => {
    const out = buildRefineUserText(POST, INSTR).toLowerCase();
    expect(out).toContain("honor every rule in the\nsystem prompt");
    expect(out).toContain("never reintroduce a forbidden word");
  });

  test("asks for output only (no preamble/quotes)", () => {
    const out = buildRefineUserText(POST, INSTR);
    expect(out).toContain("Output ONLY the rewritten post");
  });

  test("trims surrounding whitespace on both inputs", () => {
    const out = buildRefineUserText(`  ${POST}  `, `\n${INSTR}\n`);
    expect(out).toContain(`INSTRUCTION:\n${INSTR}`);
    expect(out).toContain(`CURRENT POST:\n${POST}`);
  });
});
