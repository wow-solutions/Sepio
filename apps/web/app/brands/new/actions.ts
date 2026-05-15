"use server";

import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { WizardSchema, type WizardData } from "./schema";

export type CreateBrandResult =
  | { ok: true; brandId: string }
  | { ok: false; error: string };

export async function createBrand(input: WizardData): Promise<CreateBrandResult> {
  const parsed = WizardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid wizard data",
    };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // 1. Insert brand
  const brandRow: TablesInsert<"brands"> = {
    account_id: user.id,
    name: v.name,
    slug: v.slug,
    website_url: v.website_url || null,
    industry: v.industry || null,
    description: v.description || null,
    primary_language: v.primary_language,
    additional_languages: [],
    wizard_completed: true,
    wizard_step: 0,
  };

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .insert(brandRow)
    .select("id")
    .single();

  if (brandErr || !brand) {
    if (brandErr?.code === "23505") {
      return { ok: false, error: "A brand with that slug already exists." };
    }
    return { ok: false, error: brandErr?.message ?? "Failed to create brand" };
  }

  // 2. Insert brand_config (1:1, brand_id is PK)
  const now = new Date().toISOString();
  const configRow: TablesInsert<"brand_configs"> = {
    brand_id: brand.id,
    brand_voice: v.brand_voice || null,
    tone_attributes: v.tone_attributes,
    forbidden_words: v.forbidden_words,
    required_phrases: v.required_phrases,
    voc_pain_points: v.voc_pain_points,
    voc_desired_outcomes: v.voc_desired_outcomes,
    trigger_events: v.trigger_events,
    seo_keywords_primary: v.seo_keywords_primary,
    seo_keywords_secondary: v.seo_keywords_secondary,
    approval_mode: v.approval_mode,
    voice_samples: v.voice_samples.map((s) => ({ ...s, added_at: now })),
  };

  const { error: configErr } = await supabase
    .from("brand_configs")
    .insert(configRow);

  if (configErr) {
    // Roll back the brand row so the user can retry cleanly.
    await supabase.from("brands").delete().eq("id", brand.id);
    return { ok: false, error: configErr.message };
  }

  return { ok: true, brandId: brand.id };
}
