"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteSecret } from "@/lib/vault";
import { parseCompetitorUrl } from "@/lib/market-brain/competitor-input";
import { triggerMarketBrainForBrand } from "@/lib/market-brain/trigger-worker";

// Error fields are i18n keys (brandDetail.marketBrain.error.*), resolved client-side.
export type CompetitorActionResult = { ok: true } | { ok: false; error: string };

export async function disconnectLinkedIn(brandId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // RLS-checked ownership read
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) throw new Error("Brand not found");

  // Use service role for the token row (RLS may block direct delete depending
  // on policy; we already verified ownership above).
  const service = createServiceRoleClient();
  const { data: token } = await service
    .from("brand_oauth_tokens")
    .select("id, vault_secret_id")
    .eq("brand_id", brandId)
    .eq("platform", "linkedin")
    .maybeSingle();

  if (!token) {
    revalidatePath(`/brands/${brandId}`);
    return;
  }

  if (token.vault_secret_id) {
    await deleteSecret(token.vault_secret_id).catch((err) => {
      console.error("Failed to delete vault secret (continuing):", err);
    });
  }

  await service.from("brand_oauth_tokens").delete().eq("id", token.id);
  revalidatePath(`/brands/${brandId}`);
}

// ── Market Brain: competitor management (T8 PR-C) ────────────────────────────
// market_competitors has owner-CRUD RLS (using + with check on brand ownership),
// so the user client is enough — RLS rejects writes to brands you don't own.

export async function addCompetitor(
  brandId: string,
  rawUrl: string,
): Promise<CompetitorActionResult> {
  const parsed = parseCompetitorUrl(rawUrl);
  if (!parsed) return { ok: false, error: "invalidUrl" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };

  const { error } = await supabase.from("market_competitors").insert({
    brand_id: brandId,
    url: parsed.url,
    domain: parsed.domain,
    source: "agency_manual",
    status: "approved",
    added_by: user.id,
  });

  if (error) {
    // unique(brand_id, domain) → already tracking this competitor.
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    return { ok: false, error: error.message };
  }

  revalidatePath(`/brands/${brandId}`);
  return { ok: true };
}

export async function setCompetitorStatus(
  competitorId: string,
  brandId: string,
  status: "approved" | "disabled",
): Promise<CompetitorActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };

  // RLS using-clause limits the update to competitors of brands you own.
  const { error } = await supabase
    .from("market_competitors")
    .update({ status })
    .eq("id", competitorId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/brands/${brandId}`);
  return { ok: true };
}

// Manual "recompute now" — kicks the per-brand worker fire-and-forget. Gated by
// beta_access (same lock the cron honours); cron weekly is the passive path.
export async function recomputeMarketBrain(
  brandId: string,
): Promise<CompetitorActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) return { ok: false, error: "brandNotFound" };

  const { data: account } = await supabase
    .from("accounts")
    .select("beta_access")
    .eq("id", user.id)
    .maybeSingle();
  if (!account?.beta_access) return { ok: false, error: "noBetaAccess" };

  triggerMarketBrainForBrand(brandId);
  return { ok: true };
}

// Polled by the panel after a recompute to detect completion: when computed_at
// changes from the baseline the page rendered with, the worker has written a
// fresh row and the UI can auto-refresh. RLS scopes the read to owned brands.
export async function getDifferentiationStatus(
  brandId: string,
): Promise<{ computedAt: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { computedAt: null };

  const { data } = await supabase
    .from("market_differentiation")
    .select("computed_at")
    .eq("brand_id", brandId)
    .maybeSingle();

  return { computedAt: data?.computed_at ?? null };
}
