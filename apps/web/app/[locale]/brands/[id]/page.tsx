import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { DifferentiationSchema } from "@/lib/market-brain/derived-only";
import { disconnectLinkedIn } from "./actions";
import { CompetitorsPanel } from "./competitors-panel";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkedin?: string; linkedin_error?: string; message?: string }>;
};

export default async function BrandDetailPage({ params, searchParams }: PageProps) {
  const { id: brandId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("brandDetail");
  const locale = await getLocale();

  // Fetch brand (RLS-scoped)
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, slug, industry, primary_language")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) notFound();

  // Fetch all brands for TopBar
  const { data: brandsList } = await supabase
    .from("brands")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Fetch LinkedIn connection status
  const { data: linkedinToken } = await supabase
    .from("brand_oauth_tokens")
    .select("account_handle, scopes, connected_at, expires_at, status")
    .eq("brand_id", brandId)
    .eq("platform", "linkedin")
    .maybeSingle();

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at, beta_access")
    .eq("id", user.id)
    .maybeSingle();

  // Market Brain surface is gated by beta_access (T8 D6) — only fetch its data
  // when the account is in the beta, so non-beta brands pay nothing.
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

  let differentiation: ReturnType<typeof DifferentiationSchema.safeParse> | null = null;
  let differentiationComputedAt: string | null = null;
  if (betaAccess) {
    const { data: diffRow } = await supabase
      .from("market_differentiation")
      .select("common_themes, positioning_gaps, computed_at")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (diffRow) {
      differentiationComputedAt = diffRow.computed_at;
      // Re-validate the persisted jsonb at the read boundary (RLS proves
      // ownership, not shape) — same discipline as the generation seam (PR-A).
      differentiation = DifferentiationSchema.safeParse(diffRow);
    }
  }

  const switcherBrands: BrandOption[] = (brandsList ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
  }));

  const color = brandColor(brand.slug);

  return (
    <AppShell
      active="connections"
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
        {/* Header */}
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
              fontVariationSettings: '"opsz" 144',
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: "-0.028em",
              color: "var(--ink)",
              margin: 0,
              lineHeight: 1.02,
            }}
          >
            {brand.name}
          </h1>
        </div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: "0 0 8px",
          }}
        >
          {brand.industry ? `${brand.industry} · ` : ""}
          {brand.primary_language.toUpperCase()}
        </p>
        <Link
          href={`/brands/${brand.id}/settings`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 36,
            padding: "0 18px",
            background: "var(--sepio-sepia)",
            color: "var(--sepio-cream)",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            marginBottom: 32,
          }}
        >
          {t("settingsLink")}
        </Link>

        {/* Toasts */}
        {sp.linkedin === "connected" && (
          <Banner
            tone="success"
            title={t("toast.connectedTitle")}
            body={t("toast.connectedBody")}
          />
        )}
        {sp.linkedin_error && (
          <Banner
            tone="error"
            title={t("toast.errorTitle", { code: sp.linkedin_error })}
            body={sp.message ?? t("toast.errorFallback")}
          />
        )}

        {/* Connections section */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "0 0 16px",
            letterSpacing: "-0.01em",
          }}
        >
          {t("platformsHeader")}
        </h2>

        <div
          style={{
            background: "var(--raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink)",
                  margin: "0 0 4px",
                }}
              >
                LinkedIn
              </h3>
              {linkedinToken ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-muted)",
                    margin: 0,
                  }}
                >
                  {t.rich("linkedin.connectedAs", {
                    handle: linkedinToken.account_handle ?? "",
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                      marginLeft: 12,
                    }}
                  >
                    {t("linkedin.since", { date: formatDate(linkedinToken.connected_at, locale) })}
                  </span>
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-muted)",
                    margin: 0,
                  }}
                >
                  {t("linkedin.notConnected")}
                </p>
              )}
            </div>

            {linkedinToken ? (
              <div style={{ display: "flex", gap: 8 }}>
                {/* Plain <a> — i18n <Link> would prefix /ru/ which breaks API routes */}
                <a
                  href={`/api/auth/linkedin/request?brand_id=${brand.id}`}
                  style={buttonStyleSecondary()}
                >
                  {t("linkedin.reconnect")}
                </a>
                <form action={disconnectWithBrand.bind(null, brand.id)}>
                  <button type="submit" style={buttonStyleDanger()}>
                    {t("linkedin.disconnect")}
                  </button>
                </form>
              </div>
            ) : (
              <a
                href={`/api/auth/linkedin/request?brand_id=${brand.id}`}
                style={buttonStylePrimary()}
              >
                {t("linkedin.connect")}
              </a>
            )}
          </div>
        </div>

        {/* Market Brain (gated by beta_access) */}
        {betaAccess && (
          <>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--ink)",
                margin: "40px 0 4px",
                letterSpacing: "-0.01em",
              }}
            >
              {t("marketBrain.header")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" }}>
              {t("marketBrain.subtitle")}
            </p>

            <h3 style={subHeadingStyle()}>{t("marketBrain.competitorsHeader")}</h3>
            <CompetitorsPanel
              brandId={brand.id}
              competitors={competitors}
              differentiationComputedAt={differentiationComputedAt}
            />

            <h3 style={{ ...subHeadingStyle(), marginTop: 28 }}>
              {t("marketBrain.differentiationHeader")}
            </h3>
            <DifferentiationView
              parsed={differentiation}
              labels={{
                empty: t("marketBrain.differentiationEmpty"),
                themes: t("marketBrain.themesLabel"),
                gaps: t("marketBrain.gapsLabel"),
                prevalence: t("marketBrain.prevalenceLabel"),
              }}
            />
          </>
        )}

        {/* Back link */}
        <div style={{ marginTop: 32 }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: 13,
              color: "var(--ink-muted)",
              textDecoration: "none",
            }}
          >
            {t("back")}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function subHeadingStyle(): React.CSSProperties {
  return {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px",
  };
}

function DifferentiationView({
  parsed,
  labels,
}: {
  parsed: ReturnType<typeof DifferentiationSchema.safeParse> | null;
  labels: { empty: string; themes: string; gaps: string; prevalence: string };
}) {
  const data = parsed?.success ? parsed.data : null;
  const hasContent =
    data && (data.common_themes.length > 0 || data.positioning_gaps.length > 0);

  if (!hasContent) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>{labels.empty}</p>
    );
  }

  return (
    <div
      style={{
        background: "var(--raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {data.common_themes.length > 0 && (
        <div>
          <p style={cardLabelStyle()}>{labels.themes}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.common_themes.map((th, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--ink)",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {th.prevalence_count}× {labels.prevalence}
                </span>
                <span>{th.theme}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.positioning_gaps.length > 0 && (
        <div>
          <p style={cardLabelStyle()}>{labels.gaps}</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.positioning_gaps.map((gap, i) => (
              <li key={i} style={{ padding: "6px 0" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                  {gap.angle}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "2px 0 0" }}>
                  {gap.rationale}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function cardLabelStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--ink-faint)",
    margin: "0 0 8px",
  };
}

function makeInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Server action wrapper to bind brandId (form action requires (formData) shape)
async function disconnectWithBrand(brandId: string): Promise<void> {
  "use server";
  await disconnectLinkedIn(brandId);
}

function Banner({ tone, title, body }: { tone: "success" | "error"; title: string; body: string }) {
  const colors =
    tone === "success"
      ? { bg: "var(--pass-bg)", border: "rgba(122,160,121,0.30)", fg: "var(--pass)" }
      : { bg: "rgba(200, 80, 80, 0.08)", border: "rgba(200,80,80,0.30)", fg: "rgb(180, 60, 60)" };
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 24,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: colors.fg,
        }}
      >
        {title}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 13,
          color: "var(--ink-muted)",
        }}
      >
        {body}
      </p>
    </div>
  );
}

function buttonStylePrimary(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 36,
    padding: "0 16px",
    background: "var(--sepio-sepia)",
    color: "var(--sepio-cream)",
    border: "1px solid var(--sepio-sepia)",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function buttonStyleSecondary(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 32,
    padding: "0 14px",
    background: "transparent",
    color: "var(--ink)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function buttonStyleDanger(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: 32,
    padding: "0 14px",
    background: "transparent",
    color: "rgb(180, 60, 60)",
    border: "1px solid rgba(200,80,80,0.30)",
    borderRadius: 9999,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
