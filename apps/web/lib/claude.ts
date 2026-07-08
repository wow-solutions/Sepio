import Anthropic from "@anthropic-ai/sdk";
import type { Tables } from "./supabase/database.types";
import {
  FORMAT_SPECS,
  modelIdForTier,
  TEMPERATURE_BY_FORMAT,
  type GenFormat,
} from "./_private/format-specs";
import {
  buildBlogArticleUserText,
  type BuildBlogArticleUserTextOptions,
} from "./_private/blog-article";
import { PRIMARY_URL_TOKEN } from "./kitchen/channel-formats";
import { withTransientRetry } from "./retry";

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
  // True when the model hit max_tokens and the output was cut off mid-stream
  // (response.stop_reason === "max_tokens") — the caller got a truncated
  // draft, not an intentionally short one.
  truncated: boolean;
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
  const langName = LANGUAGE_NAMES[primaryLanguage] ?? (primaryLanguage || "English");
  const parts: string[] = [
    "You are a content writer for a specific brand. Write everything in the brand's voice.",
    // Language instruction is intentionally near the top — Claude follows
    // it more reliably than if it were buried. Stated explicitly so the
    // model ignores the language of the topic hint (entered in any language)
    // AND the voice samples below. An agency may write in its native language
    // (en/ru) while the brand publishes in the client's language (e.g. Spanish);
    // the voice sample teaches STYLE, never the output language.
    `Write the ENTIRE output in ${langName}, regardless of the language of the topic hint, brief, source article, OR the voice samples below. Never switch to or mirror the input language.`,
    `The voice samples show HOW this brand writes — tone, rhythm, sentence shape, vocabulary register. Emulate that style, but if a sample is written in another language, do NOT mirror its language: render the style in ${langName}.`,
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
// voice system prompt. Output language = the brand's primary_language (chosen at
// onboarding) — buildBrandContext's "write the ENTIRE output in <lang>
// regardless of the brief's language" instruction handles a brief written in any
// language (e.g. a Russian brief → article in the brand's language).
export async function generateBlogArticle(
  config: BrandConfigRow,
  primaryLanguage: string,
  brief: string,
  opts?: GenerateOptions & BuildBlogArticleUserTextOptions,
): Promise<GenerateResult> {
  const b = brief.trim();
  if (!b) throw new ClaudeError("brief is empty");
  return callClaude(config, primaryLanguage, buildBlogArticleUserText(b, opts), "blog", opts);
}

// Content Kitchen (fan-out): adapt a SOURCE article (the blog/hosted post) into
// a channel-native variant in the target FORMAT. Same engine, brand voice, and
// moat as generation — the system prompt (configForGen + extraContext) carries
// the voice + differentiation, the format spec sizes/structures the output, and
// only the user message changes: it ADAPTS the source rather than writing from a
// topic. Mirrors generateBlogArticle/adaptToLinkedIn in shape.
//
// Cross-link contract: when the target format benefits from linking to the full
// article, the model references it as the LITERAL token PRIMARY_URL_TOKEN
// ({{PRIMARY_URL}}) — never a real URL it invents. The cross-link resolver
// substitutes the real destination URL at publish/export time. For formats whose
// directive forbids in-body links (LinkedIn/X/Threads/Facebook), no link at all.
export async function generateVariantFromSource(
  config: BrandConfigRow,
  primaryLanguage: string,
  sourceBody: string,
  format: GenFormat,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const source = sourceBody.trim();
  if (!source) throw new ClaudeError("source body is empty");
  const label = FORMAT_SPECS[format].label;
  const userText = [
    `Below is a SOURCE ARTICLE. Adapt it into a ${label} for this brand.`,
    "Pick the single strongest platform-native angle — do NOT summarize everything; one sharp idea beats a recap.",
    "Preserve the brand's point of view and the substance of the source; only the shape, length, and structure change to fit the format directive in the system prompt.",
    `If — and only if — the format benefits from linking to the full article, reference it EXACTLY as the literal token ${PRIMARY_URL_TOKEN}. Never invent or write a real URL; emit that exact token and nothing else as the link.`,
    "If the format directive forbids links in the body, do NOT add any link.",
    "Output ONLY the content itself — no preamble, no surrounding quotes.",
    "",
    "SOURCE ARTICLE:",
    source,
  ].join("\n");
  return callClaude(config, primaryLanguage, userText, format, opts);
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

  // SDK default timeout is 10 min — longer than any route's maxDuration (300s),
  // so Vercel would kill a slow call with an opaque 504 before the SDK fails
  // into the ClaudeError path. maxRetries: 0 because the SDK retries timeouts
  // and 429/5xx too: one 240s attempt + a retry blows the 300s budget (blog runs
  // primary language first, siblings after — latency stacks). withTransientRetry
  // below replaces it with a single bounded retry that skips timeouts entirely.
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 0 });

  const systemText = buildBrandContext(
    config,
    primaryLanguage,
    opts?.extraContext,
  );
  const spec = FORMAT_SPECS[format];

  let response: Anthropic.Message;
  try {
    response = await withTransientRetry(
      () =>
        client.messages.create(
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
        ),
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

  const result = buildGenerateResult(response);

  if (result.truncated) {
    // Grep-able prefix for Vercel logs — model/format/output_tokens pinpoint
    // which generation got cut off without needing to correlate request IDs.
    console.warn(
      `[claude] truncated output: model=${modelIdForTier(spec.model)} format=${format} output_tokens=${result.usage.output_tokens}`,
    );
  }

  return result;
}

// Pure: assemble the GenerateResult from a raw Claude response. Extracted for
// unit tests. Filters to text blocks, joins, trims, and throws ClaudeError on
// empty output — same contract callClaude always had, plus `truncated` so
// callers can tell a cut-off draft from an intentionally short one.
export function buildGenerateResult(response: Anthropic.Message): GenerateResult {
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
    truncated: response.stop_reason === "max_tokens",
  };
}
