import { describe, expect, test } from "bun:test";
import { parseSitesPath, blogPath, blogUrl } from "./blog-domain-routing";

const PRIMARY = "es";
const LOCALES = ["en", "ru"];

describe("parseSitesPath", () => {
  test("root → primary-locale index", () => {
    expect(parseSitesPath(undefined, PRIMARY, LOCALES)).toEqual({
      kind: "index",
      locale: "es",
    });
    expect(parseSitesPath([], PRIMARY, LOCALES)).toEqual({
      kind: "index",
      locale: "es",
    });
  });

  test("single known-locale segment → that locale's index", () => {
    expect(parseSitesPath(["en"], PRIMARY, LOCALES)).toEqual({
      kind: "index",
      locale: "en",
    });
    expect(parseSitesPath(["ru"], PRIMARY, LOCALES)).toEqual({
      kind: "index",
      locale: "ru",
    });
  });

  test("single non-locale segment → primary-locale article", () => {
    expect(parseSitesPath(["mi-articulo"], PRIMARY, LOCALES)).toEqual({
      kind: "article",
      locale: "es",
      slug: "mi-articulo",
    });
  });

  test("locale + slug → sibling article", () => {
    expect(parseSitesPath(["en", "my-post"], PRIMARY, LOCALES)).toEqual({
      kind: "article",
      locale: "en",
      slug: "my-post",
    });
  });

  test("non-locale first of two segments → notfound", () => {
    expect(parseSitesPath(["foo", "bar"], PRIMARY, LOCALES)).toEqual({
      kind: "notfound",
    });
  });

  test("three+ segments → notfound", () => {
    expect(parseSitesPath(["en", "a", "b"], PRIMARY, LOCALES)).toEqual({
      kind: "notfound",
    });
  });
});

describe("blogPath", () => {
  test("primary locale is unprefixed", () => {
    expect(blogPath("es", "es")).toBe("/");
    expect(blogPath("es", "es", "post")).toBe("/post");
  });
  test("additional locales are prefixed", () => {
    expect(blogPath("es", "en")).toBe("/en");
    expect(blogPath("es", "en", "post")).toBe("/en/post");
    expect(blogPath("es", "ru", "post")).toBe("/ru/post");
  });
});

describe("blogUrl", () => {
  test("absolute https on the client host", () => {
    expect(blogUrl("blog.24clima.com", "es", "es", "post")).toBe(
      "https://blog.24clima.com/post",
    );
    expect(blogUrl("blog.24clima.com", "es", "en", "post")).toBe(
      "https://blog.24clima.com/en/post",
    );
    expect(blogUrl("blog.24clima.com", "es", "es")).toBe(
      "https://blog.24clima.com/",
    );
  });
});
