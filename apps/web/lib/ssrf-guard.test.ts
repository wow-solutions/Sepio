import { describe, expect, test } from "bun:test";
import { assertPublicHttpUrl, isPublicHttpUrl, safeFetch, SsrfError } from "./ssrf-guard";

// Helper: mock DNS lookup that returns the provided address(es).
function mockLookup(...addresses: string[]) {
  return async () => addresses.map((address) => ({ address }));
}

describe("assertPublicHttpUrl — IPv4 literals", () => {
  const PRIVATE = [
    ["127.0.0.1", "loopback"],
    ["10.0.0.1", "10/8 private"],
    ["172.16.0.1", "172.16/12 lower"],
    ["172.31.255.255", "172.16/12 upper"],
    ["192.168.1.1", "192.168/16"],
    ["169.254.169.254", "cloud metadata / link-local"],
    ["169.254.0.1", "link-local"],
    ["100.64.0.0", "CGNAT lower"],
    ["100.127.255.255", "CGNAT upper"],
    ["0.0.0.0", "0.0.0.0/8 reserved"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ] as const;
  for (const [ip, label] of PRIVATE) {
    test(`${ip} (${label}) rejects`, async () => {
      await expect(assertPublicHttpUrl(`http://${ip}`)).rejects.toThrow(SsrfError);
    });
  }

  const PUBLIC = [
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1", // just outside 172.16/12
    "172.32.0.1", // just outside 172.16/12
    "100.63.255.255", // just outside CGNAT
    "100.128.0.0", // just outside CGNAT
  ];
  for (const ip of PUBLIC) {
    test(`${ip} (public) passes`, async () => {
      const u = await assertPublicHttpUrl(`http://${ip}`);
      expect(u.hostname).toBe(ip);
    });
  }
});

describe("assertPublicHttpUrl — IPv6 literals", () => {
  const PRIVATE = [
    "::1",
    "::",
    "fe80::1",
    "fe8f:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "fc00::1",
    "fd00::1",
    "ff00::1",
    // IPv4-mapped, dotted form
    "::ffff:127.0.0.1",
    "::ffff:192.168.1.1",
    // IPv4-mapped, HEX form (the critical canonicalized notation)
    "::ffff:7f00:1", // 127.0.0.1
    "::ffff:c0a8:101", // 192.168.1.1
    "::ffff:a9fe:a9fe", // 169.254.169.254
    // case insensitivity
    "FE80::1",
    "FC00::1",
  ];
  for (const ip of PRIVATE) {
    test(`[${ip}] rejects`, async () => {
      await expect(assertPublicHttpUrl(`http://[${ip}]`)).rejects.toThrow(SsrfError);
    });
  }

  test("[2001:4860:4860::8888] (public) passes", async () => {
    const u = await assertPublicHttpUrl("http://[2001:4860:4860::8888]");
    expect(u.hostname.replace(/^\[|\]$/g, "")).toBe("2001:4860:4860::8888");
  });
});

describe("assertPublicHttpUrl — blocked hostnames", () => {
  const BLOCKED = [
    "localhost",
    "metadata.google.internal",
    "internal.service.internal",
    "myservice.local",
    "localhost.localhost",
    "LOCALHOST",
  ];
  for (const host of BLOCKED) {
    test(`${host} rejects`, async () => {
      await expect(assertPublicHttpUrl(`http://${host}`)).rejects.toThrow(SsrfError);
    });
  }
});

describe("assertPublicHttpUrl — DNS resolution with injected lookup", () => {
  test("public hostname → public IP passes", async () => {
    const u = await assertPublicHttpUrl("https://example.com/path", {
      lookup: mockLookup("93.184.216.34"),
    });
    expect(u.hostname).toBe("example.com");
    expect(u.pathname).toBe("/path");
  });

  const REBIND_TO_PRIVATE = ["127.0.0.1", "192.168.1.1", "10.0.0.1", "169.254.169.254", "fe80::1", "fc00::1"];
  for (const ip of REBIND_TO_PRIVATE) {
    test(`hostname resolving to ${ip} rejects`, async () => {
      await expect(
        assertPublicHttpUrl("http://rebind.example.com", { lookup: mockLookup(ip) }),
      ).rejects.toThrow(SsrfError);
    });
  }

  test("multiple A records, one private → rejects", async () => {
    await expect(
      assertPublicHttpUrl("http://multi.example.com", { lookup: mockLookup("93.184.216.34", "192.168.1.1") }),
    ).rejects.toThrow(SsrfError);
  });

  test("multiple A records, all public → passes", async () => {
    const u = await assertPublicHttpUrl("http://cdn.example.com", {
      lookup: mockLookup("93.184.216.34", "1.1.1.1"),
    });
    expect(u.hostname).toBe("cdn.example.com");
  });

  test("DNS resolution failure throws SsrfError", async () => {
    await expect(
      assertPublicHttpUrl("http://nxdomain.invalid", {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toThrow(SsrfError);
  });

  test("empty DNS answer throws SsrfError", async () => {
    await expect(
      assertPublicHttpUrl("http://empty.example.com", { lookup: mockLookup() }),
    ).rejects.toThrow(SsrfError);
  });
});

describe("assertPublicHttpUrl — protocol validation", () => {
  test("http allowed", async () => {
    const u = await assertPublicHttpUrl("http://8.8.8.8");
    expect(u.protocol).toBe("http:");
  });
  test("https allowed", async () => {
    const u = await assertPublicHttpUrl("https://8.8.8.8");
    expect(u.protocol).toBe("https:");
  });
  test("ftp rejects", async () => {
    await expect(assertPublicHttpUrl("ftp://8.8.8.8")).rejects.toThrow(SsrfError);
  });
  test("file rejects", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(SsrfError);
  });
  test("garbage rejects", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow(SsrfError);
  });
});

describe("isPublicHttpUrl — boolean wrapper", () => {
  test("true for public IP", async () => {
    expect(await isPublicHttpUrl("http://8.8.8.8")).toBe(true);
  });
  test("false for private IP", async () => {
    expect(await isPublicHttpUrl("http://127.0.0.1")).toBe(false);
  });
  test("false for blocked hostname", async () => {
    expect(await isPublicHttpUrl("http://localhost")).toBe(false);
  });
  test("false for invalid URL", async () => {
    expect(await isPublicHttpUrl("not a url")).toBe(false);
  });
  test("forwards lookup option (private → false)", async () => {
    expect(await isPublicHttpUrl("http://example.com", { lookup: mockLookup("192.168.1.1") })).toBe(false);
  });
  test("forwards lookup option (public → true)", async () => {
    expect(await isPublicHttpUrl("http://example.com", { lookup: mockLookup("93.184.216.34") })).toBe(true);
  });
});

describe("safeFetch — redirect-validating fetch", () => {
  // A public lookup so the guard inside safeFetch passes for hostname URLs.
  const lookup = mockLookup("93.184.216.34");

  test("2xx response is returned as-is", async () => {
    const fetchImpl = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const res = await safeFetch("https://example.com", undefined, { fetchImpl, lookup });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("forces redirect:manual on the underlying fetch", async () => {
    let seenRedirect: RequestRedirect | undefined;
    const fetchImpl = (async (_u: unknown, init: RequestInit) => {
      seenRedirect = init.redirect;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await safeFetch("https://example.com", { redirect: "follow" } as RequestInit, { fetchImpl, lookup });
    expect(seenRedirect).toBe("manual");
  });

  test("follows a 3xx to a public Location and returns the final response", async () => {
    const fetchImpl = (async (u: unknown) => {
      if (String(u) === "https://example.com/") {
        return new Response(null, { status: 302, headers: { location: "https://example.com/final" } });
      }
      return new Response("final", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await safeFetch("https://example.com/", undefined, { fetchImpl, lookup });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("final");
  });

  test("rejects a 3xx whose Location resolves to a private IP", async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://example.com/", undefined, { fetchImpl, lookup })).rejects.toThrow(SsrfError);
  });

  test("rejects when the initial URL resolves to a private IP (guard runs before fetch)", async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      safeFetch("http://internal.example.com", undefined, { fetchImpl, lookup: mockLookup("10.0.0.1") }),
    ).rejects.toThrow(SsrfError);
    expect(fetched).toBe(false);
  });

  test("throws after exceeding max hops (redirect loop)", async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: "https://example.com/loop" } })) as unknown as typeof fetch;
    await expect(
      safeFetch("https://example.com/", undefined, { fetchImpl, lookup, maxHops: 3 }),
    ).rejects.toThrow(SsrfError);
  });

  test("3xx without a Location header is returned as-is", async () => {
    const fetchImpl = (async () => new Response(null, { status: 304 })) as unknown as typeof fetch;
    const res = await safeFetch("https://example.com/", undefined, { fetchImpl, lookup });
    expect(res.status).toBe(304);
  });
});
