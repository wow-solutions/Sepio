import Anthropic from "@anthropic-ai/sdk";
import type { Tables } from "./supabase/database.types";
import {
  FORMAT_SPECS,
  modelIdForTier,
  TEMPERATURE_BY_FORMAT,
  type GenFormat,
} from "./_private/format-specs";
import { buildBlogArticleUserText } from "./_private/blog-article";
import type { KeywordIdea } from "./_private/dataforseo-keywords";

// Per-format draft generation. Two cached system blocks:
//   1. Brand context (voice, VOC, samples) — stable per brand, so one topic
//      fanned out to N formats is a cache hit across all N calls.
//   2. The per-format directive (length / structure / behavioral signal) —
//      stable per format.
// Topic goes in the user message — never part of the cached prefix. Model +
// token budget come from the format spec (short formats → Haiku, long → Sonnet).

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

// ── Context injection seam (T4) ─────────────────────────────────────────────
// A pre-rendered, brand-stable context section. Future moat/voice features
// (Market Brain differentiation, voice fingerprint, client-brain research,
// proof library) each compute their block UPSTREAM — where they own their own
// async DB reads — and hand the finished text in via `extraContext`. The block
// is folded into the cached brand-context system block (block 1) BEFORE its
// cache breakpoint, so a topic fanned to N formats stays a cache hit and no
// feature has to re-edit prompt assembly here (avoids the merge race).
//
// Contract: a self-contained Markdown section that already starts with its own
// "# Heading", matching buildBrandContext's convention. Order is caller-
// controlled (array order). Empty/blank blocks are dropped.
export type ContextBlock = string;

export type GenerateOptions = {
  apiKey?: string;
  signal?: AbortSignal;
  extraContext?: ContextBlock[];
};

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
  extraContext: ContextBlock[] = [],
): string {
  const langName = LANGUAGE_NAMES[primaryLanguage] ?? primaryLanguage;
  const parts: string[] = [
    "You are a content writer for a specific brand. Write everything in the brand's voice.",
    // Language instruction is intentionally near the top — Claude follows
    // it more reliably than if it were buried. Stated explicitly so the
    // model ignores the language of the topic hint (which may be entered
    // in any language by the user).
    `Write in ${langName}, regardless of what language the topic hint is written in.`,
    "Output ONLY the content itself. No preamble, no surrounding quotes, no 'Here is...' framing.",
    // Anti-tell: the model defaults to templated openers ("Most [people] I talk
    // to…") which read as AI-written and make a feed of posts look identical.
    // Forbid the class and demand a concrete, varied first line.
    "Opening line — never start with a formulaic template such as \"Most [people] I talk to…\", \"In today's world…\", \"Let's be honest…\", \"Here's the thing…\", or \"We've all been there…\". These are AI tells. Open instead with something concrete: a specific moment, a number, a name, a blunt claim, or a sharp question. Vary the opening structure — never reuse the same hook pattern post to post.",
    // Format-specific rules (length, structure, behavioral signal) are injected
    // separately as the format directive block — not here.
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

  // Context injection seam: append upstream-computed brand-stable blocks, in
  // order, dropping blanks. Stays inside block 1 (pre-cache-breakpoint).
  for (const block of extraContext) {
    const trimmed = block.trim();
    if (trimmed) parts.push(trimmed);
  }

  return parts.join("\n\n");
}

export async function generatePost(
  config: BrandConfigRow,
  primaryLanguage: string,
  topicHint: string | undefined,
  format: GenFormat = "linkedin_post",
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const hint = topicHint?.trim();
  const userText = hint
    ? `Topic to write about: ${hint}`
    : "Choose a topic that is timely and relevant to this brand's audience.";
  return callClaude(config, primaryLanguage, userText, format, opts);
}

// Adapt a longer source (blog article, newsletter, etc.) into a LinkedIn
// post. Keeps the same brand voice + language + post-length contract as
// generatePost — the system prompt does all that work, we only swap the
// user message with the adaptation instruction and the source text.
export async function adaptToLinkedIn(
  config: BrandConfigRow,
  primaryLanguage: string,
  sourceText: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    throw new ClaudeError("source text is empty");
  }
  const userText = [
    "Below is a longer article. Adapt the most interesting idea from it into a single LinkedIn post.",
    "Pick ONE concrete insight — do not summarize the whole thing. Open with a punchy hook,",
    "develop the one idea in 2-4 short paragraphs, end with a question or soft CTA.",
    "Stay in the brand voice from the system prompt. Match the language instruction there.",
    "Do not include a link to the source article unless the system prompt says to.",
    "",
    "SOURCE ARTICLE:",
    trimmed,
  ].join("\n");
  return callClaude(config, primaryLanguage, userText, "linkedin_post", opts);
}

// Angle-of-approach (moat): generate a post from a fully-assembled user message.
// The caller (generate route) builds the angle template via buildAngleUserText
// in lib/_private/angles.ts — that's where the topic/instruction/citation live.
// This wrapper only hands that text to callClaude with the brand-stable system
// prompt + linkedin_post format, mirroring generatePost/adaptToLinkedIn.
export async function generatePostFromUserMessage(
  config: BrandConfigRow,
  primaryLanguage: string,
  userText: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const trimmed = userText.trim();
  if (!trimmed) {
    throw new ClaudeError("user message is empty");
  }
  return callClaude(config, primaryLanguage, trimmed, "linkedin_post", opts);
}

// Blog-article generation (blog-PR6): a full long-form article from a brief.
// Reuses the shared `blog` FORMAT_SPEC (Sonnet, GEO structure) and the brand
// voice system prompt. Output language is always English — the brief may be in
// any language (buildBrandContext's "write in English regardless of the hint
// language" instruction handles a Russian brief → English article).
export async function generateBlogArticle(
  config: BrandConfigRow,
  brief: string,
  opts?: GenerateOptions & { keywords?: KeywordIdea[] },
): Promise<GenerateResult> {
  const b = brief.trim();
  if (!b) throw new ClaudeError("brief is empty");
  return callClaude(config, "en", buildBlogArticleUserText(b, opts?.keywords), "blog", opts);
}

// Editorial Memory (T3): rewrite an existing post per a natural-language
// instruction. This is the rewrite HALF of the refine flow — a SEPARATE call
// from the rule extractor (design D1), run concurrently by the refine route
// (T5). It honors the brand's active rules the same way generation does: the
// caller passes the merged word columns via `config` and the voice_note blocks
// via `opts.extraContext`, so buildBrandContext folds them into the cached
// system prompt and the rewrite never reintroduces a banned word or opener.
export async function refineRewrite(
  config: BrandConfigRow,
  primaryLanguage: string,
  originalPost: string,
  instruction: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const post = originalPost.trim();
  const instr = instruction.trim();
  if (!post) throw new ClaudeError("post text is empty");
  if (!instr) throw new ClaudeError("instruction is empty");
  return callClaude(
    config,
    primaryLanguage,
    buildRefineUserText(post, instr),
    "linkedin_post",
    opts,
  );
}

// Pure: assemble the user message for a refine rewrite. Exported for unit tests.
// Instruction before post, output-only directive, and an explicit reminder to
// honor the system-prompt rules (the rewrite must not undo accumulated memory).
export function buildRefineUserText(
  originalPost: string,
  instruction: string,
): string {
  return [
    "Below is an existing post and an instruction for how to change it.",
    "Rewrite the post applying the instruction. Change only what the instruction asks —",
    "keep everything else intact. Stay in the brand voice and honor EVERY rule in the",
    "system prompt: never reintroduce a forbidden word or a banned opening pattern.",
    "Output ONLY the rewritten post — no preamble, no surrounding quotes.",
    "",
    "INSTRUCTION:",
    instruction.trim(),
    "",
    "CURRENT POST:",
    originalPost.trim(),
  ].join("\n");
}

async function callClaude(
  config: BrandConfigRow,
  primaryLanguage: string,
  userText: string,
  format: GenFormat,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  const systemText = buildBrandContext(
    config,
    primaryLanguage,
    opts?.extraContext,
  );
  const spec = FORMAT_SPECS[format];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: modelIdForTier(spec.model),
        max_tokens: spec.maxTokens,
        temperature: TEMPERATURE_BY_FORMAT[format],
        system: [
          {
            type: "text",
            text: systemText,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: spec.directive,
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
