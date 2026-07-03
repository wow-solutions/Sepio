import { afterEach, describe, expect, it } from "bun:test";

import { authorizeCron } from "./cron-auth";

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/test", {
    headers: auth !== undefined ? { authorization: auth } : {},
  });
}

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("authorizeCron", () => {
  it("accepts the exact bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Bearer s3cret"))).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Bearer s3creX"))).toBe(false);
  });

  it("rejects a token with different length", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Bearer s3cret-longer"))).toBe(false);
    expect(authorizeCron(req("Bearer s3"))).toBe(false);
  });

  it("rejects a missing authorization header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req())).toBe(false);
  });

  it("rejects when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(req("Bearer s3cret"))).toBe(false);
  });

  it("rejects non-Bearer schemes", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Basic s3cret"))).toBe(false);
  });

  it("never throws on malformed input", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req(""))).toBe(false);
    expect(authorizeCron(req("Bearer"))).toBe(false);
    expect(authorizeCron(req(`Bearer ${"x".repeat(4096)}`))).toBe(false);
  });
});
