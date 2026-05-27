import { describe, expect, test } from "bun:test";
import { adaptFor, getAdapter } from "./index";

describe("format-adapter registry", () => {
  test("getAdapter returns the matching platform adapter", () => {
    expect(getAdapter("linkedin").platform).toBe("linkedin");
    expect(getAdapter("telegram").platform).toBe("telegram");
    expect(getAdapter("blog").platform).toBe("blog");
  });

  test("adaptFor dispatches to the right adapter", () => {
    const out = adaptFor("telegram", { text: "Hello\nworld" });
    expect(out.platform).toBe("telegram");
  });

  test("throws on an unknown platform", () => {
    // @ts-expect-error — exercising the runtime guard with an invalid platform
    expect(() => getAdapter("myspace")).toThrow();
  });
});
