"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type UpdateBrandBasicsResult =
  | { ok: true }
  | { ok: false; error: string };

const ALLOWED_LANGUAGES = ["en", "es", "ru", "pt", "fr"] as const;
type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];

type UpdateBasicsInput = {
  industryCategoryId: string | null;
  primaryLanguage: string;
  additionalLanguages: string[];
  brandVoice: string;
};

/**
 * Update brand.industry_category_id, primary_language и brand_configs.brand_voice.
 * Authorization: RLS на brands и brand_configs enforces account_id = auth.uid().
 */
export async function updateBrandBasics(
  brandId: string,
  input: UpdateBasicsInput,
): Promise<UpdateBrandBasicsResult> {
  if (!brandId) {
    return { ok: false, error: "Missing brandId" };
  }

  if (!ALLOWED_LANGUAGES.includes(input.primaryLanguage as AllowedLanguage)) {
    return { ok: false, error: "Invalid language" };
  }

  // Allowlist: every entry must be a supported string; dedupe; exclude primary.
  if (
    !Array.isArray(input.additionalLanguages) ||
    !input.additionalLanguages.every(
      (l) => typeof l === "string" && ALLOWED_LANGUAGES.includes(l as AllowedLanguage),
    )
  ) {
    return { ok: false, error: "Invalid additional language" };
  }
  const additionalLanguages = [...new Set(input.additionalLanguages)].filter(
    (l) => l !== input.primaryLanguage,
  );

  if (input.brandVoice.length > 5000) {
    return { ok: false, error: "brand_voice too long (max 5000)" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Cache display name в legacy text column (backward-compat для кода читающего brand.industry)
  let displayName: string | null = null;
  if (input.industryCategoryId) {
    const { data: cat } = await supabase
      .from("industry_categories")
      .select("name_en")
      .eq("id", input.industryCategoryId)
      .maybeSingle();
    displayName = cat?.name_en ?? null;
  }

  const { error: brandErr } = await supabase
    .from("brands")
    .update({
      industry_category_id: input.industryCategoryId,
      industry: displayName,
      primary_language: input.primaryLanguage,
      additional_languages: additionalLanguages,
    })
    .eq("id", brandId);

  if (brandErr) {
    return { ok: false, error: brandErr.message };
  }

  // brand_configs существует с момента wizard. UPDATE через update (а не upsert) —
  // если row отсутствует (нештатно), просто не пишем — invariant breach логируем.
  const { error: cfgErr } = await supabase
    .from("brand_configs")
    .update({ brand_voice: input.brandVoice || null })
    .eq("brand_id", brandId);

  if (cfgErr) {
    return { ok: false, error: cfgErr.message };
  }

  revalidatePath(`/brands/${brandId}`);
  revalidatePath(`/brands/${brandId}/settings`);
  return { ok: true };
}
