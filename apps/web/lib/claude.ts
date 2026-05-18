import Anthropic from "@anthropic-ai/sdk";
import type { Tables } from "./supabase/database.types";

// Sprint 1A writer — Sonnet 4.6 LinkedIn-style draft generation.
//
// Caching strategy:
//   Render order is tools → system → messages. Brand context (voice, VOC,
//   forbidden words, voice samples) is stable for a given brand and goes in
//   the system block with cache_control. Topic hint changes per request and
//   goes in the user message — never part of the cached prefix.
//
//   Sonnet 4.6 minimum cacheable prefix = 2048 tokens. Voice samples + VOC
//   typically push past that on the second+ generate call for a brand.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800; // ~150-250 word post + safety headroom

export type BrandConfigRow = Tables<"brand_configs">;

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

export type GenerateResult = {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
};

type VocItem = { quote: string; source?: string };
type VoiceSample = { text: string; source?: string };

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Map ISO codes to English language names for clear instructions to Claude.
// Falls through to the code itself for unknown values (defensive default).
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  ru: "Russian",
  pt: "Portuguese",
  fr: "French",
};

export function buildBrandContext(
  config: BrandConfigRow,
  primaryLanguage: string,
): string {
  const langName = LANGUAGE_NAMES[primaryLanguage] ?? primaryLanguage;
  const parts: string[] = [
    "You write LinkedIn-style posts for a specific brand.",
    // Language instruction is intentionally near the top — Claude follows
    // it more reliably than if it were buried. Stated explicitly so the
    // model ignores the language of the topic hint (which may be entered
    // in any language by the user).
    `Write the post in ${langName}, regardless of what language the topic hint is written in.`,
    "Output ONLY the post body. No preamble, no surrounding quotes, no 'Here is...' framing.",
    "Length: 150-250 words. Punchy opener. One concrete idea. Optional question to invite replies.",
  ];

  if (config.brand_voice) {
    parts.push(`# Brand voice\n${config.brand_voice}`);
  }

  const tones = config.tone_attributes ?? [];
  if (tones.length) {
    parts.push(`# Tone\n${tones.join(", ")}`);
  }

  const forbidden = config.forbidden_words ?? [];
  if (forbidden.length) {
    parts.push(`# Never use these words\n${forbidden.join(", ")}`);
  }

  const required = config.required_phrases ?? [];
  if (required.length) {
    parts.push(`# Weave in if natural\n${required.join(", ")}`);
  }

  const pain = asArray<VocItem>(config.voc_pain_points);
  if (pain.length) {
    parts.push(
      `# Customer pain points (what they actually say)\n` +
        pain.map((p) => `- "${p.quote}"`).join("\n"),
    );
  }

  const desired = asArray<VocItem>(config.voc_desired_outcomes);
  if (desired.length) {
    parts.push(
      `# What customers want\n` +
        desired.map((d) => `- "${d.quote}"`).join("\n"),
    );
  }

  const primaryKw = config.seo_keywords_primary ?? [];
  if (primaryKw.length) {
    parts.push(`# SEO primary keywords (use sparingly)\n${primaryKw.join(", ")}`);
  }

  const samples = asArray<VoiceSample>(config.voice_samples);
  if (samples.length) {
    parts.push(
      `# Voice samples (how this brand actually writes)\n` +
        samples
          .map((s, i) => `## Sample ${i + 1}\n${s.text}`)
          .join("\n\n"),
    );
  }

  return parts.join("\n\n");
}

export async function generatePost(
  config: BrandConfigRow,
  primaryLanguage: string,
  topicHint: string | undefined,
  opts?: { apiKey?: string; signal?: AbortSignal },
): Promise<GenerateResult> {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  const systemText = buildBrandContext(config, primaryLanguage);
  const hint = topicHint?.trim();
  const userText = hint
    ? `Write a post about: ${hint}`
    : "Write a post about something timely and relevant to this brand's audience.";

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: systemText,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userText }],
      },
      { signal: opts?.signal },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new ClaudeError(
        `Claude ${err.status}: ${err.message}`,
        err.status,
        err,
      );
    }
    if (err instanceof Error) {
      throw new ClaudeError(err.message, undefined, err);
    }
    throw new ClaudeError("Unknown error calling Claude", undefined, err);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new ClaudeError("Claude returned no text content");
  }

  return {
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
