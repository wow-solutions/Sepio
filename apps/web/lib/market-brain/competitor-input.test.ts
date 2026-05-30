import { describe, expect, test } from "bun:test";
import { parseCompetitorUrl } from "./competitor-input";

describe("parseCompetitorUrl", () => {
  test("bare domain → https url + domain", () => {
    expect(parseCompetitorUrl("acme.com")).toEqual({
      url: "https://acme.com",
      domain: "acme.com",
    });
  });

  test("full https url is preserved, domain extracted", () => {
    expect(parseCompetitorUrl("https://acme.com/about?x=1")).toEqual({
      url: "https://acme.com/about?x=1",
      domain: "acme.com",
    });
  });

  test("strips leading www. from domain (keeps url)", () => {
    expect(parseCompetitorUrl("www.acme.com")).toEqual({
      url: "https://www.acme.com",
      domain: "acme.com",
    });
  });

  test("lowercases the domain", () => {
    expect(parseCompetitorUrl("ACME.COM")?.domain).toBe("acme.com");
  });

  test("subdomain is kept (only www stripped)", () => {
    expect(parseCompetitorUrl("blog.acme.com")?.domain).toBe("blog.acme.com");
  });

  test("http scheme accepted", () => {
    expect(parseCompetitorUrl("http://acme.com")?.url).toBe("http://acme.com");
  });

  test("empty / whitespace → null", () => {
    expect(parseCompetitorUrl("")).toBeNull();
    expect(parseCompetitorUrl("   ")).toBeNull();
  });

  test("no dot (bare hostname) → null", () => {
    expect(parseCompetitorUrl("localhost")).toBeNull();
    expect(parseCompetitorUrl("notadomain")).toBeNull();
  });

  test("non-http scheme → null", () => {
    expect(parseCompetitorUrl("ftp://acme.com")).toBeNull();
    expect(parseCompetitorUrl("javascript:alert(1)")).toBeNull();
  });

  test("garbage → null", () => {
    expect(parseCompetitorUrl("http://")).toBeNull();
    expect(parseCompetitorUrl("...")).toBeNull();
  });
});
