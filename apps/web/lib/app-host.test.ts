import { describe, expect, test } from "bun:test";
import { bareHost, isAppHost } from "./app-host";

describe("bareHost", () => {
  test("strips port and lowercases", () => {
    expect(bareHost("Blog.24Clima.com:443")).toBe("blog.24clima.com");
    expect(bareHost("LOCALHOST:3000")).toBe("localhost");
  });
  test("empty for null/undefined/blank", () => {
    expect(bareHost(null)).toBe("");
    expect(bareHost(undefined)).toBe("");
    expect(bareHost("")).toBe("");
  });
});

describe("isAppHost", () => {
  test("app hosts are true (never routed to _sites)", () => {
    expect(isAppHost("sepio.app")).toBe(true);
    expect(isAppHost("www.sepio.app")).toBe(true);
    expect(isAppHost("sepio-git-main-x.vercel.app")).toBe(true);
    expect(isAppHost("localhost:3000")).toBe(true);
    expect(isAppHost("127.0.0.1")).toBe(true);
  });
  test("unknown/empty host treated as app (fail safe)", () => {
    expect(isAppHost(null)).toBe(true);
    expect(isAppHost("")).toBe(true);
  });
  test("client blog domains are NOT app hosts", () => {
    expect(isAppHost("blog.24clima.com")).toBe(false);
    expect(isAppHost("news.example.org")).toBe(false);
    expect(isAppHost("sepio.app.evil.com")).toBe(false); // not our apex
  });
});
