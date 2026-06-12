import { describe, expect, test } from "bun:test";
import {
  classifyFromSignals,
  detectPlatform,
  normalizeUrl,
  type RawSignals,
} from "./site-fingerprint";

function signals(partial: Partial<RawSignals>): RawSignals {
  return {
    homepageHtml: null,
    homepageHeaders: null,
    wpJson: null,
    ...partial,
  };
}

describe("classifyFromSignals", () => {
  test("wp-json 200 with wp/v2 => wordpress / high", () => {
    const out = classifyFromSignals(
      signals({ wpJson: { namespaces: ["oembed/1.0", "wp/v2"] } }),
    );
    expect(out.platform).toBe("wordpress");
    expect(out.confidence).toBe("high");
    expect(out.signals.join(" ")).toMatch(/wp\/v2/);
  });

  test("generator meta WordPress (no wp-json) => wordpress / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml:
          '<html><head><meta name="generator" content="WordPress 6.5"></head></html>',
      }),
    );
    expect(out.platform).toBe("wordpress");
    expect(out.confidence).toBe("medium");
    expect(out.signals.join(" ")).toMatch(/WordPress 6\.5/);
  });

  test("wp-content asset paths => wordpress / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml:
          '<link rel="stylesheet" href="/wp-content/themes/x/style.css">',
      }),
    );
    expect(out.platform).toBe("wordpress");
    expect(out.confidence).toBe("medium");
  });

  test("Shopify header => shopify / high", () => {
    const out = classifyFromSignals(
      signals({ homepageHeaders: new Headers({ "X-ShopId": "12345" }) }),
    );
    expect(out.platform).toBe("shopify");
    expect(out.confidence).toBe("high");
  });

  test("Shopify CDN in HTML => shopify / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml: '<script src="https://cdn.shopify.com/s/x.js"></script>',
      }),
    );
    expect(out.platform).toBe("shopify");
    expect(out.confidence).toBe("medium");
  });

  test("Wix header => wix / high", () => {
    const out = classifyFromSignals(
      signals({ homepageHeaders: new Headers({ "X-Wix-Request-Id": "abc" }) }),
    );
    expect(out.platform).toBe("wix");
    expect(out.confidence).toBe("high");
  });

  test("Wix generator meta => wix / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml:
          '<meta name="generator" content="Wix.com Website Builder">',
      }),
    );
    expect(out.platform).toBe("wix");
    expect(out.confidence).toBe("medium");
  });

  test("Squarespace comment => squarespace / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml: "<html><!-- This is Squarespace. --></html>",
      }),
    );
    expect(out.platform).toBe("squarespace");
    expect(out.confidence).toBe("medium");
  });

  test("Webflow generator meta => webflow / medium", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml: '<meta name="generator" content="Webflow">',
      }),
    );
    expect(out.platform).toBe("webflow");
    expect(out.confidence).toBe("medium");
  });

  test("nothing matches => custom / low with checked signals", () => {
    const out = classifyFromSignals(
      signals({
        homepageHtml: "<html><body>hand-rolled site</body></html>",
        homepageHeaders: new Headers({ "Content-Type": "text/html" }),
      }),
    );
    expect(out.platform).toBe("custom");
    expect(out.confidence).toBe("low");
    expect(out.signals.length).toBeGreaterThan(0);
  });

  test("wp-json wins but conflicting Shopify HTML => wordpress / medium (downgraded)", () => {
    const out = classifyFromSignals(
      signals({
        wpJson: { namespaces: ["wp/v2"] },
        homepageHtml: '<script src="https://cdn.shopify.com/s/x.js"></script>',
      }),
    );
    expect(out.platform).toBe("wordpress");
    expect(out.confidence).toBe("medium");
  });

  test("empty wp-json (no namespaces) is ignored", () => {
    const out = classifyFromSignals(signals({ wpJson: {} }));
    expect(out.platform).toBe("custom");
  });
});

describe("normalizeUrl", () => {
  test("bare domain gets https://", () => {
    expect(normalizeUrl("example.com")?.origin).toBe("https://example.com");
  });
  test("keeps existing scheme", () => {
    expect(normalizeUrl("http://example.com/path")?.origin).toBe(
      "http://example.com",
    );
  });
  test("rejects junk", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("ftp://nope")).toBeNull();
  });
});

describe("detectPlatform", () => {
  test("throwing fetch resolves to custom / low and never rejects", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const out = await detectPlatform("example.com", { fetchImpl });
    expect(out.platform).toBe("custom");
    expect(out.confidence).toBe("low");
    expect(typeof out.checked_at).toBe("string");
    expect(Number.isNaN(Date.parse(out.checked_at))).toBe(false);
  });

  test("unparseable URL resolves to custom / low without any fetch", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const out = await detectPlatform("", { fetchImpl });
    expect(out.platform).toBe("custom");
    expect(out.confidence).toBe("low");
    expect(called).toBe(false);
  });

  test("wp-json 200 over injected fetch => wordpress / high", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = String(input);
      if (u.endsWith("/wp-json/")) {
        return new Response(JSON.stringify({ namespaces: ["wp/v2"] }), {
          status: 200,
        });
      }
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    const out = await detectPlatform("https://blog.example.com", { fetchImpl });
    expect(out.platform).toBe("wordpress");
    expect(out.confidence).toBe("high");
  });
});
