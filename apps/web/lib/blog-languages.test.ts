import { describe, expect, test } from "bun:test";
import { resolveBlogLanguages } from "./blog-languages";

describe("resolveBlogLanguages", () => {
  test("primary only when no additional languages", () => {
    expect(resolveBlogLanguages("es", [])).toEqual(["es"]);
    expect(resolveBlogLanguages("es", null)).toEqual(["es"]);
    expect(resolveBlogLanguages("es", undefined)).toEqual(["es"]);
  });

  test("primary first, then additional", () => {
    expect(resolveBlogLanguages("es", ["ru"])).toEqual(["es", "ru"]);
    expect(resolveBlogLanguages("es", ["ru", "en"])).toEqual(["es", "ru", "en"]);
  });

  test("primary is dropped from the additional set", () => {
    expect(resolveBlogLanguages("es", ["es", "ru"])).toEqual(["es", "ru"]);
  });

  test("duplicate additional languages collapse", () => {
    expect(resolveBlogLanguages("es", ["ru", "ru", "en"])).toEqual([
      "es",
      "ru",
      "en",
    ]);
  });

  test("blank and whitespace-only entries are dropped, others trimmed", () => {
    expect(resolveBlogLanguages("es", [" ru ", "", "  "])).toEqual(["es", "ru"]);
  });

  test("preserves additional-language order", () => {
    expect(resolveBlogLanguages("en", ["pt", "fr", "es"])).toEqual([
      "en",
      "pt",
      "fr",
      "es",
    ]);
  });
});
