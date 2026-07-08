import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { DifferentiationSchema } from "@/lib/market-brain/derived-only";
import { coerceClientBrain } from "@/lib/client-brain/schema";
import type { BrandRuleRow } from "../rules-panel";
import { BrandAnalysisSections } from "../brand-analysis-sections";
import { BasicsForm } from "./basics-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BrandSettingsPage({ params }: PageProps) {
  const { id: brandId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("brandSettings");
  const locale = await getLocale();

  // Fetch brand + joined industry category for display + brand_voice from config
  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, slug, industry, industry_category_id, primary_language, additional_languages, industry_categories ( name_en, name_ru )",
    )
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) notFound();

  const { data: brandConfig } = await supabase
    .from("brand_configs")
    .select("brand_voice, target_market")
    .eq("brand_id", brandId)
    .maybeSingle();

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at, beta_access")
    .eq("id", user.id)
    .maybeSingle();

  // ── Analysis surfaces (moved here from the brand Connections page) ──────────
  // Client Brain facts (ungated): services/locations/pricing + proof items.
  const { data: cbConfig } = await supabase
    .from("brand_configs")
    .select("services, locations, pricing")
    .eq("brand_id", brandId)
    .maybeSingle();
  const { data: proofRows } = await supabase
    .from("proof_items")
    .select("kind, body, source, verifiable")
    .eq("brand_id", brandId);
  const clientBrainFacts = coerceClientBrain({
    services: cbConfig?.services,
    locations: cbConfig?.locations,
    pricing: cbConfig?.pricing,
    proofItems: proofRows ?? [],
  });

  // website_url for Client Brain "study site" (separate read; not in the typed
  // brand select above to keep that query stable).
  const { data: siteRow } = await supabase
    .from("brands")
    .select("website_url")
    .eq("id", brandId)
    .maybeSingle();
  const website = siteRow?.website_url ?? null;

  // Market Brain + Editorial Memory are beta-gated — only fetch when in beta.
  const betaAccess = account?.beta_access === true;
  const competitors = betaAccess
    ? (
        await supabase
          .from("market_competitors")
          .select("id, url, domain, status")
          .eq("brand_id", brandId)
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];
  const brandRules: BrandRuleRow[] = betaAccess
    ? (
        await supabase
          .from("brand_rules")
          .select("id, rule_type, scope, rule_text, human_label, active, source_post_id")
          .eq("brand_id", brandId)
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];
  let differentiationParsed:
    | ReturnType<typeof DifferentiationSchema.safeParse>
    | null = null;
  if (betaAccess) {
    const { data: diffRow } = await supabase
      .from("market_differentiation")
      .select("common_themes, positioning_gaps")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (diffRow) differentiationParsed = DifferentiationSchema.safeParse(diffRow);
  }

  // Fetch brands list для TopBar
  const { data: brandsList } = await supabase
    .from("brands")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const switcherBrands: BrandOption[] = (brandsList ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
  }));

  const color = brandColor(brand.slug);

  // Display name: prefer joined category, fall back to legacy industry text
  type JoinedCategory = { name_en: string; name_ru: string };
  const joinedCategory = brand.industry_categories as JoinedCategory | null;
  const initialDisplayName = joinedCategory
    ? locale === "ru"
      ? joinedCategory.name_ru
      : joinedCategory.name_en
    : brand.industry;

  return (
    <AppShell
      active="settings"
      brands={switcherBrands}
      currentBrandId={brand.id}
      breadcrumb={`${brand.name} · ${t("breadcrumb")}`}
      userInitials={makeInitials(account?.display_name ?? user.email ?? "")}
      newPostHref={`/writer?brand=${brand.id}`}
      planTier={account?.plan_tier ?? null}
      planStatus={account?.plan_status ?? null}
      trialEndsAt={account?.trial_ends_at ?? null}
    >
      <section style={{ maxWidth: 880, margin: "0 auto", padding: "40px 32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
          }}
        >
          <BrandDot color={color} size={14} />
          <h1
            style={{
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontVariationSettings: '"opsz" 96',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: "-0.026em",
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.04,
            }}
          >
            {t("title", { brand: brand.name })}
          </h1>
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 32px",
          }}
        >
          {t("subtitle")}
        </p>

        {/*
          Tabs приготовлено: сейчас одна секция «Основное». Sprint 1B добавит:
          - Аккаунты (LinkedIn — сейчас на /brands/[id])
          - Удаление данных (retention toggle per TODO #2)
          Когда секций станет ≥2, конвертируем в shadcn Tabs.
        */}
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "0 0 16px",
            letterSpacing: "-0.01em",
          }}
        >
          {t("sections.basics")}
        </h2>

        <div
          style={{
            background: "var(--raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 24,
          }}
        >
          <BasicsForm
            brandId={brand.id}
            locale={locale}
            initialCategoryId={brand.industry_category_id}
            initialDisplayName={initialDisplayName}
            initialLanguage={brand.primary_language}
            initialAdditionalLanguages={brand.additional_languages ?? []}
            initialBrandVoice={brandConfig?.brand_voice ?? ""}
            initialTargetMarket={brandConfig?.target_market ?? null}
            clientBrainLocations={clientBrainFacts.locations}
          />
        </div>

        {/* Analysis: Client Brain, Market Brain, Editorial Memory (moved here
            from the brand Connections page). */}
        <BrandAnalysisSections
          brandId={brand.id}
          website={website}
          clientBrainFacts={clientBrainFacts}
          betaAccess={betaAccess}
          competitors={competitors}
          differentiationParsed={differentiationParsed}
          brandRules={brandRules}
        />

        <div style={{ marginTop: 32 }}>
          <Link
            href={`/brands/${brand.id}`}
            style={{
              fontSize: 13,
              color: "var(--ink-muted)",
              textDecoration: "none",
            }}
          >
            {t("backToBrand")}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
