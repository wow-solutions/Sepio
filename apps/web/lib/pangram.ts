import { z } from "zod";

// Pangram Labs API v3 — verified smoke test 2026-05-14.
// Endpoint: POST https://text.api.pangram.com/v3
// Auth: header `x-api-key`
// Body: { text: string }
//
// checkText is the strict primitive: on failure it THROWS (no mock/default
// values). Detection is no longer a product promise (ADR-0018), so the generate
// route uses the best-effort tryDetection wrapper below — a Pangram failure must
// degrade to a null score, never block saving a paid draft.

const PANGRAM_URL = "https://text.api.pangram.com/v3";

// A hung Pangram connection must not hold the serverless function open until
// the route's maxDuration (300s) — that loses the already-generated draft.
const PANGRAM_TIMEOUT_MS = 20_000;

const WindowSchema = z.object({
  text: z.string(),
  label: z.string(),
  ai_assistance_score: z.number().min(0).max(1),
  confidence: z.string(),
  start_index: z.number().int().nonnegative(),
  end_index: z.number().int().nonnegative(),
  word_count: z.number().int().nonnegative(),
  token_length: z.number().int().nonnegative(),
});

export const PangramResponseSchema = z.object({
  text: z.string(),
  version: z.string(),
  headline: z.string(),
  prediction: z.string(),
  prediction_short: z.string(),
  fraction_ai: z.number().min(0).max(1),
  fraction_ai_assisted: z.number().min(0).max(1),
  fraction_human: z.number().min(0).max(1),
  num_ai_segments: z.number().int().nonnegative(),
  num_ai_assisted_segments: z.number().int().nonnegative(),
  num_human_segments: z.number().int().nonnegative(),
  windows: z.array(WindowSchema),
});

export type PangramResponse = z.infer<typeof PangramResponseSchema>;
export type PangramWindow = z.infer<typeof WindowSchema>;

export class PangramError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PangramError";
  }
}

// ADR-0014 D3: detection_score = round(fraction_human * 100).
export function deriveDetectionScore(response: PangramResponse): number {
  return Math.round(response.fraction_human * 100);
}

export async function checkText(
  text: string,
  opts?: { apiKey?: string; signal?: AbortSignal },
): Promise<PangramResponse> {
  const apiKey = opts?.apiKey ?? process.env.PANGRAM_API_KEY;
  if (!apiKey) {
    throw new PangramError("PANGRAM_API_KEY is not configured");
  }

  let res: Response;
  try {
    res = await fetch(PANGRAM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ text }),
      // Caller's signal composes with (never replaces) the hard timeout.
      signal: opts?.signal
        ? AbortSignal.any([opts.signal, AbortSignal.timeout(PANGRAM_TIMEOUT_MS)])
        : AbortSignal.timeout(PANGRAM_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new PangramError(
        `Pangram request timed out after ${PANGRAM_TIMEOUT_MS}ms`,
        undefined,
        err,
      );
    }
    throw new PangramError("Pangram request failed (network)", undefined, err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PangramError(
      `Pangram returned ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }

  const raw: unknown = await res.json().catch((err) => {
    throw new PangramError("Pangram returned invalid JSON", res.status, err);
  });

  const parsed = PangramResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PangramError(
      `Pangram response shape unexpected: ${parsed.error.message.slice(0, 300)}`,
      res.status,
      parsed.error,
    );
  }

  return parsed.data;
}

// Best-effort detection (ADR-0018). Wraps checkText and swallows ANY error into a
// null result the caller can persist as-is — a Pangram outage, timeout, bad shape,
// or missing API key must never throw away an already-generated (paid) draft.
// Success → { score: round(fraction_human*100), breakdown: response }.
export async function tryDetection(
  text: string,
  opts?: { apiKey?: string; signal?: AbortSignal },
): Promise<{ score: number | null; breakdown: PangramResponse | null }> {
  try {
    const resp = await checkText(text, opts);
    return { score: deriveDetectionScore(resp), breakdown: resp };
  } catch (err) {
    console.error("[pangram] detection failed (best-effort, skipped):", err);
    return { score: null, breakdown: null };
  }
}
