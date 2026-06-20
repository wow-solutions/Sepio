import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";
import { BrandDot } from "@/components/brand/brand-dot";
import type { BrandOption } from "@/components/brand/brand-switcher";
import { brandColor } from "@/lib/brand-color";
import { disconnectLinkedIn, detectPlatformForBrand } from "./actions";
import { WordPressConnect } from "./wordpress-connect";
import { BlogDomainConnect } from "./blog-domain-connect";

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

  // Fetch WordPress connection status
  const { data: wpToken } = await supabase
    .from("brand_oauth_tokens")
    .select("account_handle, status")
    .eq("brand_id", brandId)
    .eq("platform", "wordpress")
    .maybeSingle();

  // Site detection fields (new columns; database.types.ts not regenerated yet).
  // TODO: regen types, drop the cast.
  const { data: siteRow } = await (supabase as unknown as SupabaseClient)
    .from("brands")
    .select("website_url, detected_platform, detected_confidence, detected_at, platform_override")
    .eq("id", brandId)
    .maybeSingle();
  const site = (siteRow ?? {}) as {
    website_url?: string | null;
    detected_platform?: string | null;
    detected_confidence?: string | null;
    detected_at?: string | null;
    platform_override?: string | null;
  };
  const effectivePlatform = site.platform_override ?? site.detected_platform ?? null;
  const recommended = recommendedMethod(effectivePlatform);

  // Only offer "Connect WordPress" when it could actually apply: the site is
  // detected as WordPress, OR detection hasn't run yet (unknown), OR there's
  // already a WP connection to manage. Hide it when we KNOW the site is a
  // different platform (e.g. custom) — don't show a dead-end option.
  const showWordPress =
    !!wpToken || effectivePlatform === "wordpress" || !effectivePlatform;

  // Client blog domain mapping (owner reads via RLS). Not in database.types yet.
  const { data: blogDomainRow } = await (supabase as unknown as SupabaseClient)
    .from("brand_blog_domains")
    .select("domain, status, cname_target")
    .eq("brand_id", brandId)
    .maybeSingle();
  const blogDomain = (blogDomainRow ?? null) as {
    domain: string;
    status: string;
    cname_target: string | null;
  } | null;

  // Client Brain / Market Brain / Editorial Memory data + render moved to brand
  // Settings (/brands/[id]/settings). This page is Connections only.
  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at")
    .eq("id", user.id)
    .maybeSingle();

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

        {/* Publishing destinations */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--ink)",
            margin: "40px 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          Publishing
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" }}>
          Where articles for this brand get published.
        </p>

        {/* Site detection + recommended method */}
        <div
          style={{
            background: "var(--raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 22,
            marginBottom: 16,
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
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
                Your website
              </h3>
              {site.website_url ? (
                <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
                  {site.website_url}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                      marginLeft: 12,
                    }}
                  >
                    {site.detected_platform
                      ? `detected: ${site.detected_platform}${site.detected_confidence ? ` (${site.detected_confidence})` : ""}`
                      : "not scanned yet"}
                  </span>
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
                  No website set for this brand.
                </p>
              )}
              <p style={{ fontSize: 13, color: "var(--ink)", margin: "8px 0 0" }}>
                Recommended: {recommended.label}
              </p>
            </div>
            {site.website_url && (
              <form action={detectWithBrand.bind(null, brand.id)}>
                <button type="submit" style={buttonStyleSecondary()}>
                  {site.detected_at ? "Re-scan" : "Scan site"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* WordPress — only when the site is (or might be) WordPress */}
        {showWordPress && (
          <div style={{ marginBottom: 16 }}>
            <WordPressConnect
              brandId={brand.id}
              connected={!!wpToken}
              accountHandle={wpToken?.account_handle ?? null}
            />
          </div>
        )}

        {/* Publish on the client's own domain (Sepio-hosted blog via DNS) */}
        <BlogDomainConnect
          brandId={brand.id}
          domain={blogDomain?.domain ?? null}
          status={blogDomain?.status ?? null}
          cnameTarget={blogDomain?.cname_target ?? null}
          liveUrl={
            blogDomain?.status === "active" ? `https://${blogDomain.domain}` : null
          }
        />

        {/* Hosted blog — always-available universal fallback */}
        <div
          style={{
            background: "var(--raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            padding: 22,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>
            Sepio-hosted blog
          </h3>
          <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: 0 }}>
            Always available. Publishes to a blog we host for you — works even when your site cannot
            be connected directly.
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
              margin: "8px 0 0",
            }}
          >
            /p/{brand.id}
          </p>
        </div>

        {/* Client Brain, Market Brain, Editorial Memory now live under brand
            Settings (/brands/[id]/settings) — this page is Connections only. */}

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

// Form-action wrapper for the "Scan site" button (must return void).
async function detectWithBrand(brandId: string): Promise<void> {
  "use server";
  await detectPlatformForBrand(brandId);
}

// Map the detected (or overridden) platform → the recommended publish method.
function recommendedMethod(platform: string | null): { key: string; label: string } {
  switch (platform) {
    case "wordpress":
      return { key: "wordpress", label: "Connect WordPress — publishes to your real site." };
    case "shopify":
    case "webflow":
    case "wix":
    case "squarespace":
      return {
        key: "hosted",
        label: `${platform} detected — direct publishing is coming soon; use your Sepio-hosted blog for now.`,
      };
    default:
      return { key: "hosted", label: "Publish to your Sepio-hosted blog (works for any site)." };
  }
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
