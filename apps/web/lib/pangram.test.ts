import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  PangramError,
  checkText,
  deriveDetectionScore,
  tryDetection,
  type PangramResponse,
} from "./pangram";

const sampleResponse: PangramResponse = {
  text: "sample",
  version: "3.3",
  headline: "Human Written",
  prediction: "We believe this document is human-written.",
  prediction_short: "Human",
  fraction_ai: 0.05,
  fraction_ai_assisted: 0.05,
  fraction_human: 0.9,
  num_ai_segments: 0,
  num_ai_assisted_segments: 0,
  num_human_segments: 1,
  windows: [
    {
      text: "sample",
      label: "Human Written",
      ai_assistance_score: 0.05,
      confidence: "High",
      start_index: 0,
      end_index: 6,
      word_count: 1,
      token_length: 2,
    },
  ],
};

const originalFetch = globalThis.fetch;

function installFetch(fn: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  globalThis.fetch = fn as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("deriveDetectionScore", () => {
  test("rounds fraction_human * 100 to int", () => {
    expect(deriveDetectionScore({ ...sampleResponse, fraction_human: 0.876 })).toBe(88);
    expect(deriveDetectionScore({ ...sampleResponse, fraction_human: 0 })).toBe(0);
    expect(deriveDetectionScore({ ...sampleResponse, fraction_human: 1 })).toBe(100);
  });
});

describe("checkText", () => {
  test("returns parsed response on 200", async () => {
    installFetch(mock(async () =>
      new Response(JSON.stringify(sampleResponse), { status: 200 }),
    ));

    const res = await checkText("hello", { apiKey: "test-key" });
    expect(res.fraction_human).toBe(0.9);
    expect(res.windows).toHaveLength(1);
  });

  test("sends x-api-key header + JSON body", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    installFetch(mock(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify(sampleResponse), { status: 200 });
    }));

    await checkText("hello", { apiKey: "test-key" });
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://text.api.pangram.com/v3");
    expect(captured!.init.method).toBe("POST");
    expect((captured!.init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    expect(JSON.parse(captured!.init.body as string)).toEqual({ text: "hello" });
  });

  test("throws PangramError with status on non-2xx", async () => {
    installFetch(mock(async () => new Response("rate limited", { status: 429 })));

    let caught: unknown;
    try {
      await checkText("hello", { apiKey: "test-key" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PangramError);
    expect((caught as PangramError).status).toBe(429);
  });

  test("throws PangramError when response shape is invalid", async () => {
    installFetch(mock(async () =>
      new Response(JSON.stringify({ bogus: "shape" }), { status: 200 }),
    ));

    let caught: unknown;
    try {
      await checkText("hello", { apiKey: "test-key" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PangramError);
    expect((caught as PangramError).message).toMatch(/shape unexpected/i);
  });

  test("throws PangramError on network failure", async () => {
    installFetch(mock(async () => {
      throw new Error("ECONNREFUSED");
    }));

    let caught: unknown;
    try {
      await checkText("hello", { apiKey: "test-key" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PangramError);
    expect((caught as PangramError).message).toMatch(/network/i);
  });

  test("throws when API key is missing", async () => {
    const original = process.env.PANGRAM_API_KEY;
    delete process.env.PANGRAM_API_KEY;
    try {
      let caught: unknown;
      try {
        await checkText("hello");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PangramError);
      expect((caught as PangramError).message).toMatch(/PANGRAM_API_KEY/);
    } finally {
      if (original !== undefined) process.env.PANGRAM_API_KEY = original;
    }
  });
});

describe("tryDetection (best-effort, ADR-0018)", () => {
  test("REGRESSION: a fetch failure degrades to {null, null}, never throws", async () => {
    installFetch(mock(async () => {
      throw new Error("ECONNREFUSED");
    }));

    const result = await tryDetection("hello", { apiKey: "test-key" });
    expect(result).toEqual({ score: null, breakdown: null });
  });

  test("REGRESSION: a timeout degrades to {null, null}, never throws", async () => {
    installFetch(mock(async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    }));

    const result = await tryDetection("hello", { apiKey: "test-key" });
    expect(result).toEqual({ score: null, breakdown: null });
  });

  test("a successful response yields score = round(fraction_human*100) + breakdown", async () => {
    installFetch(mock(async () =>
      new Response(
        JSON.stringify({ ...sampleResponse, fraction_human: 0.876 }),
        { status: 200 },
      ),
    ));

    const result = await tryDetection("hello", { apiKey: "test-key" });
    expect(result.score).toBe(88);
    expect(result.breakdown?.fraction_human).toBe(0.876);
  });

  test("a missing PANGRAM_API_KEY degrades to {null, null}, never throws", async () => {
    const original = process.env.PANGRAM_API_KEY;
    delete process.env.PANGRAM_API_KEY;
    try {
      const result = await tryDetection("hello");
      expect(result).toEqual({ score: null, breakdown: null });
    } finally {
      if (original !== undefined) process.env.PANGRAM_API_KEY = original;
    }
  });
});
