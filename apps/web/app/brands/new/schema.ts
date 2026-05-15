import { z } from "zod";

// Brand wizard — 7+1 steps. Schema mirrors brands + brand_configs rows.
// ADR-0014 D1/D2 add approval_mode and voice_samples.

const LANGUAGES = ["en", "es", "ru", "pt", "fr"] as const;

const SlugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const BasicsSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(SlugRegex, "Lowercase letters, digits, hyphens; no leading/trailing -"),
  website_url: z.string().trim().url("Must be a valid URL").or(z.literal("")).optional(),
  industry: z.string().trim().max(80).optional(),
  primary_language: z.enum(LANGUAGES),
  description: z.string().trim().max(500).optional(),
});

export const VoiceSchema = z.object({
  brand_voice: z.string().trim().max(5000).optional(),
  tone_attributes: z.array(z.string().trim().min(1).max(40)).max(8),
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

const VoiceSampleSchema = z.object({
  text: z.string().trim().min(20, "Too short to be useful").max(3000),
  source: z.enum(["linkedin", "manual"]),
});

export const VoiceSamplesSchema = z.object({
  voice_samples: z.array(VoiceSampleSchema).max(5),
});

export const WizardSchema = BasicsSchema.merge(VoiceSchema)
  .merge(WordGuardsSchema)
  .merge(VocSchema)
  .merge(SeoSchema)
  .merge(ApprovalSchema)
  .merge(VoiceSamplesSchema);

export type WizardData = z.infer<typeof WizardSchema>;

export const STEPS = [
  { id: "basics", label: "Brand basics", schema: BasicsSchema },
  { id: "voice", label: "Brand voice", schema: VoiceSchema },
  { id: "word-guards", label: "Word guards", schema: WordGuardsSchema },
  { id: "voc", label: "Customer voice", schema: VocSchema },
  { id: "seo", label: "SEO keywords", schema: SeoSchema },
  { id: "approval", label: "Approval mode", schema: ApprovalSchema },
  { id: "voice-samples", label: "Voice samples (optional)", schema: VoiceSamplesSchema, optional: true },
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
  forbidden_words: [],
  required_phrases: [],
  voc_pain_points: [],
  voc_desired_outcomes: [],
  trigger_events: [],
  seo_keywords_primary: [],
  seo_keywords_secondary: [],
  approval_mode: "manual",
  voice_samples: [],
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
