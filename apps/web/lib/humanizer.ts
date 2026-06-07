import Anthropic from "@anthropic-ai/sdk";
import { buildBrandContext } from "./claude";
import { HUMANIZER_BODY } from "./humanizer-prompt";
import type { Tables } from "./supabase/database.types";

// Rewrites text using the blader/humanizer skill (Wikipedia "Signs of AI writing"
// patterns + 2-pass audit). Wired to the "Очеловечить текст" button in the writer.
//
// Output override: the source skill emits a multi-section response (draft, audit
// bullets, final, summary). Our endpoint needs just the final text, so we append
// an explicit output contract that supersedes the skill's "Output Format" section.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

const OUTPUT_OVERRIDE = `

---

## OUTPUT CONTRACT (this supersedes the "Output Format" section above)

Internally perform the full process (draft → "What makes this obviously AI?" audit → hard-fail self-check → revised final). Run the self-check silently — it shapes the final text but NEVER appears in the output. Return ONLY the revised final text as plain output. Do NOT include:

- The draft version
- The audit bullets
- The self-check answers
- A "Changes made" summary
- Any section headers, labels, or commentary
- Markdown quote blocks (> ...) wrapping the output
- Any preamble like "Here is the humanized text:"

Rewrite style only — never strip substance. Keep every source URL, attribution line (\`Source: ...\`, \`Via: ...\`), citation, name, date, number, statistic, and call-to-action exactly as given. Zero em dashes in the output (Non-Negotiable #1).

Just the final humanized text, ready to publish as-is. Match the input's language (English in / English out, Spanish in / Spanish out).
`;

// Deterministic safety net for the em-dash hard ban (Non-Negotiable #1). The
// prompt instructs zero em dashes, but the model drops exhaustive mechanical
// rules under load, so we catch any survivor here.
//
// Scope is deliberately narrow — this layer only does what's safe WITHOUT the
// model's context, so it can never corrupt protected substance:
//   • Em dash (—) is the AI tell. A sentence-break em dash becomes a comma; an
//     em dash between two digits is a range, normalized to an en dash so the
//     range survives ("16—20%" → "16–20%") instead of becoming a list.
//   • En dash (–) is left completely untouched: numeric ranges ("16–20%"),
//     minus signs ("–5"), and label ranges ("Q1–Q2", "Jan–Mar") keep their
//     meaning. The rarer "en dash used as a sentence break" needs context to
//     tell apart from a range, so the prompt owns it, not this blind filter.
//
// Known limitation: an em dash sitting literally inside a URL or code span would
// be rewritten. In practice "—" is not URL-safe (it encodes as %E2%80%94) and
// the humanizer targets social/marketing prose, so this never fires there.
export function stripEmDashes(text: string): string {
  return (
    text
      // Em dash between two digits = a numeric range → normalize to en dash.
      .replace(/(\d)[ \t]*—[ \t]*(\d)/g, "$1–$2")
      // Remaining em dashes are sentence breaks → comma. Consume horizontal
      // whitespace hugging the dash so no stray " , " is left behind.
      .replace(/[ \t]*—[ \t]*/g, ", ")
      // Boundary cleanups for a dash that sat at an edge:
      .replace(/(^|\n)[ \t]*,[ \t]*/g, "$1") // line-leading comma (dash began a line)
      .replace(/,[ \t]*(?=[.,!?;:\n])/g, "") // comma butting against punctuation / EOL
      .replace(/,[ \t]*,/g, ",") // consecutive dashes → one comma
      .replace(/,[ \t]*$/g, "") // trailing comma at end of text
  );
}

const HUMANIZER_SYSTEM = HUMANIZER_BODY + OUTPUT_OVERRIDE;

export class HumanizerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HumanizerError";
  }
}

export type HumanizeResult = {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
};

export async function humanizeText(
  text: string,
  brandConfig?: Tables<"brand_configs">,
  primaryLanguage: string = "en",
  opts?: { apiKey?: string; signal?: AbortSignal },
): Promise<HumanizeResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new HumanizerError("text is empty");
  if (trimmed.length > 30_000) throw new HumanizerError("text too long");

  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new HumanizerError("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  // Voice calibration: if we have a brand_config, feed buildBrandContext as
  // the voice sample (matches the skill's "Voice Calibration" section, which
  // expects 2-3 paragraphs of the user's writing).
  let userText: string;
  if (brandConfig) {
    const brandContext = buildBrandContext(brandConfig, primaryLanguage);
    userText = [
      "Humanize the text below. Use the brand context as your voice-calibration sample — match the tone, sentence rhythm, vocabulary, and idiom of this brand.",
      "",
      "## Brand context (voice-calibration sample)",
      "",
      brandContext,
      "",
      "## Text to humanize",
      "",
      trimmed,
    ].join("\n");
  } else {
    userText = `Humanize this text:\n\n${trimmed}`;
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: HUMANIZER_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userText }],
      },
      { signal: opts?.signal },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new HumanizerError(
        `Claude ${err.status}: ${err.message}`,
        err.status,
        err,
      );
    }
    if (err instanceof Error) {
      throw new HumanizerError(err.message, undefined, err);
    }
    throw new HumanizerError("Unknown error calling humanizer", undefined, err);
  }

  const rewritten = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!rewritten) {
    throw new HumanizerError("Humanizer returned no text content");
  }

  // Deterministic backstop: strip any em dash the model left behind, preserving
  // numeric en-dash ranges (Non-Negotiable #1).
  const cleaned = stripEmDashes(rewritten);

  return {
    text: cleaned,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
