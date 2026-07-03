"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createSecret, deleteSecret } from "@/lib/vault";
import { parseCompetitorUrl } from "@/lib/market-brain/competitor-input";
import { detectPlatform } from "@/lib/site-fingerprint";
import { validateWordPressCredential, type WordPressCredential } from "@/lib/publishers";
import { assertPublicHttpUrl, SsrfError } from "@/lib/ssrf-guard";
import { bareHost, isAppHost } from "@/lib/app-host";
import {
  addProjectDomain,
  getProjectDomainStatus,
  removeProjectDomain,
  vercelConfigured,
  VERCEL_CNAME_TARGET,
} from "@/lib/_private/vercel-domains";

// Error fields are i18n keys (brandDetail.marketBrain.error.*), resolved client-side.
export type CompetitorActionResult = { ok: true } | { ok: false; error: string };

export type ConnectResult = { ok: true } | { ok: false; error: string };

// Verify the signed-in user owns this brand (RLS read). Returns true if so.
async function ownsBrand(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  return data != null;
}

// ── Site platform detection (advisory) ───────────────────────────────────────
// Runs the CMS fingerprint against the brand's website and stores the result on
// the brand. Triggered on demand from the connect UI (NOT in createBrand — a
// synchronous probe there would make onboarding flaky).
export async function detectPlatformForBrand(brandId: string): Promise<ConnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };

  const { data: brand } = await supabase
    .from("brands")
    .select("id, website_url")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) return { ok: false, error: "brandNotFound" };
  if (!brand.website_url) return { ok: false, error: "noWebsite" };

  // SSRF guard: never let a user-controlled URL point our fetch at an internal host.
  try {
    await assertPublicHttpUrl(brand.website_url);
  } catch (err) {
    if (err instanceof SsrfError) return { ok: false, error: "privateUrl" };
    throw err;
  }

  const fp = await detectPlatform(brand.website_url);

  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("brands")
    .update({
      detected_platform: fp.platform,
      detected_confidence: fp.confidence,
      detected_signals: fp.signals as unknown as Json,
      detected_at: fp.checked_at,
    })
    .eq("id", brandId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/brands/${brandId}`);
  return { ok: true };
}

// ── WordPress: connect / disconnect ──────────────────────────────────────────
// Stores a WordPress Application Password in Vault and records a
// brand_oauth_tokens(platform='wordpress') row. Credentials are validated
// against the site BEFORE we persist, so the wizard fails fast.
export async function connectWordPress(
  brandId: string,
  input: { siteUrl: string; username: string; appPassword: string },
): Promise<ConnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };
  if (!(await ownsBrand(supabase, brandId))) return { ok: false, error: "brandNotFound" };

  const siteUrl = input.siteUrl.trim().replace(/\/+$/, "");
  const username = input.username.trim();
  const appPassword = input.appPassword.trim();
  if (!siteUrl || !username || !appPassword) {
    return { ok: false, error: "missingFields" };
  }

  // SSRF guard: the site URL is fetched here (validate) and later at publish time.
  try {
    await assertPublicHttpUrl(siteUrl);
  } catch (err) {
    if (err instanceof SsrfError) return { ok: false, error: "privateUrl" };
    throw err;
  }

  const cred: WordPressCredential = {
    site_url: siteUrl,
    username,
    app_password: appPassword,
  };

  // Fail fast: prove the credential works before storing it.
  const valid = await validateWordPressCredential(cred);
  if (!valid) return { ok: false, error: "invalidCredential" };

  const service = createServiceRoleClient();

  // Find any prior connection so we can clean up its Vault secret AFTER the new
  // one is safely stored (never delete the working secret before the new row is
  // committed — a failure mid-way would otherwise break the live connection).
  const { data: existing, error: existErr } = await service
    .from("brand_oauth_tokens")
    .select("id, vault_secret_id")
    .eq("brand_id", brandId)
    .eq("platform", "wordpress")
    .maybeSingle();
  if (existErr) {
    // If we can't read the prior row we can't know which old secret to retire —
    // bail before creating a new secret rather than risk orphaning the old one.
    console.error("WP connect: failed to read existing token:", existErr.message);
    return { ok: false, error: "dbError" };
  }

  let secretId: string;
  try {
    secretId = await createSecret(
      cred as unknown as Json,
      `wp:${brandId}`,
      "WordPress application password",
    );
  } catch (err) {
    console.error("WP createSecret failed:", err);
    return { ok: false, error: "vaultError" };
  }

  const { error } = await service.from("brand_oauth_tokens").upsert(
    {
      brand_id: brandId,
      platform: "wordpress",
      account_handle: username,
      vault_secret_id: secretId,
      status: "active",
    },
    { onConflict: "brand_id,platform" },
  );
  if (error) {
    await deleteSecret(secretId).catch((e) =>
      console.error("WP connect: failed to clean up new secret after upsert error:", e),
    );
    return { ok: false, error: error.message };
  }

  // New connection is committed — now retire the previous secret (if different).
  if (existing?.vault_secret_id && existing.vault_secret_id !== secretId) {
    await deleteSecret(existing.vault_secret_id).catch((err) => {
      console.error("Failed to delete prior WP vault secret (continuing):", err);
    });
  }

  revalidatePath(`/brands/${brandId}`);
  return { ok: true };
}

export async function disconnectWordPress(brandId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (!(await ownsBrand(supabase, brandId))) throw new Error("Brand not found");

  const service = createServiceRoleClient();
  const { data: token } = await service
    .from("brand_oauth_tokens")
    .select("id, vault_secret_id")
    .eq("brand_id", brandId)
    .eq("platform", "wordpress")
    .maybeSingle();
  if (!token) {
    revalidatePath(`/brands/${brandId}`);
    return;
  }
  // Delete the row FIRST: if this fails we keep the (still-valid) secret so the
  // connection stays intact, rather than leaving a row pointing at a dead secret.
  const { error: delErr } = await service.from("brand_oauth_tokens").delete().eq("id", token.id);
  if (delErr) {
    console.error(`WP disconnect: failed to delete token row ${token.id}:`, delErr.message);
    throw new Error("Failed to disconnect WordPress");
  }
  // Row is gone — now retire the secret (best-effort; orphan is harmless vs a
  // dangling row).
  if (token.vault_secret_id) {
    await deleteSecret(token.vault_secret_id).catch((err) => {
      console.error("WP disconnect: failed to delete vault secret (orphaned):", err);
    });
  }
  revalidatePath(`/brands/${brandId}`);
}

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

// ── Client blog domain (blog.client.com → Sepio-hosted blog) ─────────────────
// Connect a domain the client owns. We store the mapping (status 'pending') and
// tell the client the CNAME to add. Activation to 'active' happens once the
// domain is added to the Vercel project and DNS/TLS are live (operator/Vercel
// automation — fast-follow). No secret/token: the article already lives in our
// DB; the domain only maps to the brand for rendering.
const BLOG_HOST_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function connectBlogDomain(
  brandId: string,
  rawDomain: string,
): Promise<ConnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };
  if (!(await ownsBrand(supabase, brandId))) return { ok: false, error: "brandNotFound" };

  const domain = bareHost(rawDomain);
  if (!domain || !BLOG_HOST_RE.test(domain) || isAppHost(domain)) {
    return { ok: false, error: "invalidDomain" };
  }

  const db = supabase as unknown as SupabaseClient;
  const { error } = await db.from("brand_blog_domains").upsert(
    {
      brand_id: brandId,
      domain,
      status: "pending",
      cname_target: VERCEL_CNAME_TARGET,
      vercel_domain_id: null,
      verified_at: null,
      last_error: null,
    },
    { onConflict: "brand_id" },
  );
  if (error) {
    // unique(domain) violation → the domain is already claimed by another brand.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "domainTaken" };
    }
    return { ok: false, error: error.message };
  }

  // Register the domain on OUR Vercel project so the client never touches Vercel
  // (they only add the DNS record). If Vercel isn't configured, the row stays
  // 'pending' and an operator adds it manually — graceful degrade.
  if (vercelConfigured()) {
    const add = await addProjectDomain(domain);
    if (!add.ok) {
      await db.from("brand_blog_domains")
        .update({ status: "error", last_error: add.error })
        .eq("brand_id", brandId);
      return {
        ok: false,
        error: add.error.includes("already_in_use") ? "domainTaken" : "vercelAddFailed",
      };
    }
    await db.from("brand_blog_domains")
      .update({ status: "verifying", vercel_domain_id: add.domainId })
      .eq("brand_id", brandId);
  }

  revalidatePath(`/brands/${brandId}`);
  return { ok: true };
}

// Check Vercel: once the domain is added + DNS-verified + cert-ready, flip the
// row to 'active' (which the public resolver trusts). Activation uses the
// service role — RLS forbids owners self-activating, so only this server-verified
// path can set 'active'.
export async function verifyBlogDomain(brandId: string): Promise<ConnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notSignedIn" };
  if (!(await ownsBrand(supabase, brandId))) return { ok: false, error: "brandNotFound" };
  if (!vercelConfigured()) return { ok: false, error: "vercelNotConfigured" };

  const db = supabase as unknown as SupabaseClient;
  const { data: row } = await db.from("brand_blog_domains")
    .select("domain")
    .eq("brand_id", brandId)
    .maybeSingle();
  const domain = (row as { domain: string } | null)?.domain;
  if (!domain) return { ok: false, error: "noDomain" };

  const service = createServiceRoleClient();
  const svc = service as unknown as SupabaseClient;

  let st = await getProjectDomainStatus(domain);
  // Self-heal: if the domain isn't on our Vercel project yet (e.g. the row
  // predates this automation, or the add failed earlier), add it now, then
  // re-read — so "Check status" is a single idempotent button.
  if (!st.added) {
    const add = await addProjectDomain(domain);
    if (!add.ok) {
      await svc.from("brand_blog_domains")
        .update({ status: "error", last_error: add.error })
        .eq("brand_id", brandId);
      return {
        ok: false,
        error: add.error.includes("already_in_use") ? "domainTaken" : "vercelAddFailed",
      };
    }
    await svc.from("brand_blog_domains")
      .update({ vercel_domain_id: add.domainId, cname_target: VERCEL_CNAME_TARGET })
      .eq("brand_id", brandId);
    st = await getProjectDomainStatus(domain);
  }

  if (st.added && st.verified && !st.misconfigured) {
    await svc.from("brand_blog_domains")
      .update({ status: "active", verified_at: new Date().toISOString(), last_error: null })
      .eq("brand_id", brandId);
    revalidatePath(`/brands/${brandId}`);
    return { ok: true };
  }

  const reason = !st.added ? "notAdded" : !st.verified ? "dnsNotDetected" : "certPending";
  await svc.from("brand_blog_domains")
    .update({ status: "verifying", last_error: reason })
    .eq("brand_id", brandId);
  revalidatePath(`/brands/${brandId}`);
  return { ok: false, error: reason };
}

export async function disconnectBlogDomain(brandId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (!(await ownsBrand(supabase, brandId))) throw new Error("Brand not found");

  const db = supabase as unknown as SupabaseClient;
  const { data: row } = await db.from("brand_blog_domains")
    .select("domain")
    .eq("brand_id", brandId)
    .maybeSingle();
  const domain = (row as { domain: string } | null)?.domain;

  const { error } = await db.from("brand_blog_domains").delete().eq("brand_id", brandId);
  if (error) throw new Error("Failed to disconnect domain");

  // Best-effort: release the domain from our Vercel project too.
  if (domain && vercelConfigured()) await removeProjectDomain(domain);
  revalidatePath(`/brands/${brandId}`);
}

// Manual "recompute now" runs inline in POST /api/brands/[brandId]/recompute-market-brain
// (user-session auth, worker awaited) — the browser calls it directly. See that
// route for why we don't use a fire-and-forget server action here.
