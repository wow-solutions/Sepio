import { z } from "zod";

// Pangram Labs API v3 — verified smoke test 2026-05-14.
// Endpoint: POST https://text.api.pangram.com/v3
// Auth: header `x-api-key`
// Body: { text: string }
//
// CQ-2 (plan-eng-review 2026-05-13): on failure, throw. Caller must NOT
// write to detection_dataset and must show retry toast. Do not return
// mock/default values.

const PANGRAM_URL = "https://text.api.pangram.com/v3";

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
      signal: opts?.signal,
    });
  } catch (err) {
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
