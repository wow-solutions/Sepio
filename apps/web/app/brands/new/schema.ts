import { z } from "zod";

// Brand wizard — 6+1 steps. Schema mirrors brands + brand_configs rows.
// ADR-0014 D1/D2 add approval_mode and voice_samples.
//
// 2026-05-15 — Voice step merges multi-article paste (was separate step 7).

const LANGUAGES = ["en", "es", "ru", "pt", "fr"] as const;

const SlugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Bare-domain friendly URL: accepts `24clima.com`, `https://24clima.com`, or
// empty. The action normalizes via normalizeWebsite() before DB insert.
const WebsiteShape = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine(
    (v) =>
      !v ||
      /^https?:\/\/.+\..+/i.test(v) ||
      /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/.*)?$/i.test(v),
    "Looks invalid — try something like 24clima.com",
  );

export function normalizeWebsite(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const BasicsSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(SlugRegex, "Lowercase letters, digits, hyphens; no leading/trailing -"),
  website_url: WebsiteShape,
  industry: z.string().trim().max(80).optional(),
  primary_language: z.enum(LANGUAGES),
  description: z.string().trim().max(500).optional(),
});

// Voice articles — paste up to 3 articles representing how the brand writes.
// Each capped at 3000 words. The text is auto-truncated client-side so the
// user does not have to count words manually.
export const MAX_VOICE_ARTICLES = 3;
export const MAX_VOICE_WORDS = 3000;

const VoiceArticleSchema = z.object({
  text: z.string().trim().min(20, "Too short to be useful").max(30_000),
  source: z.enum(["linkedin", "manual", "blog", "newsletter"]),
});

export const VoiceSchema = z.object({
  brand_voice: z.string().trim().max(500).optional(),
  tone_attributes: z.array(z.string().trim().min(1).max(40)).max(8),
  voice_samples: z.array(VoiceArticleSchema).max(MAX_VOICE_ARTICLES),
});

export const WordGuardsSchema = z.object({
  forbidden_words: z.array(z.string().trim().min(1).max(40)).max(50),
  required_phrases: z.array(z.string().trim().min(1).max(80)).max(20),
});

const QuoteSchema = z.object({
  quote: z.string().trim().min(1).max(400),
  source: z.string().trim().max(80).optional(),
});

export const VocSchema = z.object({
  voc_pain_points: z.array(QuoteSchema).max(10),
  voc_desired_outcomes: z.array(QuoteSchema).max(10),
  trigger_events: z.array(z.string().trim().min(1).max(80)).max(10),
});

export const SeoSchema = z.object({
  seo_keywords_primary: z.array(z.string().trim().min(1).max(80)).max(15),
  seo_keywords_secondary: z.array(z.string().trim().min(1).max(80)).max(30),
});

export const ApprovalSchema = z.object({
  approval_mode: z.enum(["manual", "auto"]),
});

export const WizardSchema = BasicsSchema.merge(VoiceSchema)
  .merge(WordGuardsSchema)
  .merge(VocSchema)
  .merge(SeoSchema)
  .merge(ApprovalSchema);

export type WizardData = z.infer<typeof WizardSchema>;

export const STEPS = [
  { id: "basics", label: "Brand basics", schema: BasicsSchema },
  { id: "voice", label: "Brand voice", schema: VoiceSchema },
  { id: "word-guards", label: "Word guards", schema: WordGuardsSchema },
  { id: "voc", label: "Customer voice", schema: VocSchema },
  { id: "seo", label: "SEO keywords (optional)", schema: SeoSchema },
  { id: "approval", label: "Approval mode", schema: ApprovalSchema },
  { id: "review", label: "Review & create" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const WIZARD_DRAFT_KEY = "quoteworthy.brand-wizard.v1";

export const wizardDefaults: WizardData = {
  name: "",
  slug: "",
  website_url: "",
  industry: "",
  primary_language: "en",
  description: "",
  brand_voice: "",
  tone_attributes: [],
  voice_samples: [],
  forbidden_words: [],
  required_phrases: [],
  voc_pain_points: [],
  voc_desired_outcomes: [],
  trigger_events: [],
  seo_keywords_primary: [],
  seo_keywords_secondary: [],
  approval_mode: "manual",
};

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Truncate text to N words, keeping leading whitespace stripped. Used by the
// voice-articles textarea so users do not have to manually trim long pastes.
export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
